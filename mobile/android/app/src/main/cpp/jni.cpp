// Ponte entre o Kotlin (AiEngine.kt) e as IAs: lê os PNG de uma pasta, processa na placa (Vulkan) e grava os PNG
// na pasta de saída, com os mesmos nomes numerados que o ffmpeg usa (%08d.png).

#include <jni.h>
#include <android/log.h>
#include <dirent.h>
#include <algorithm>
#include <atomic>
#include <cmath>
#include <memory>
#include <string>
#include <vector>

#include "gpu.h"
#include "rife.h"
#include "realesrgan.h"

#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#include "stb_image.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "aiengine", __VA_ARGS__)

static std::atomic<bool> g_cancel(false);

static std::string str(JNIEnv* env, jstring s) {
    const char* c = env->GetStringUTFChars(s, nullptr);
    std::string r(c);
    env->ReleaseStringUTFChars(s, c);
    return r;
}

/** PNG da pasta, em ordem de nome */
static std::vector<std::string> pngs(const std::string& dir) {
    std::vector<std::string> out;
    if (DIR* d = opendir(dir.c_str())) {
        while (dirent* e = readdir(d)) {
            std::string n = e->d_name;
            if (n.size() > 4 && n.substr(n.size() - 4) == ".png") out.push_back(n);
        }
        closedir(d);
    }
    std::sort(out.begin(), out.end());
    return out;
}

/** Imagem RGB numa ncnn::Mat de pixels (o formato que o RIFE e o Real-ESRGAN recebem) */
struct Img {
    unsigned char* data = nullptr;
    int w = 0, h = 0;
    ncnn::Mat mat() const { return ncnn::Mat(w, h, (void*)data, (size_t)3, 3); }
    ~Img() { if (data) stbi_image_free(data); }
};

static bool load(const std::string& path, Img& img) {
    int c = 0;
    img.data = stbi_load(path.c_str(), &img.w, &img.h, &c, 3);
    return img.data != nullptr;
}

static bool save(const std::string& path, const ncnn::Mat& m) {
    return stbi_write_png(path.c_str(), m.w, m.h, 3, m.data, 0) != 0;
}

static std::string num(int i) {
    char b[16];
    snprintf(b, sizeof(b), "%08d.png", i);
    return b;
}

static bool g_gpu_ready = false;
static void ensure_gpu() {
    if (!g_gpu_ready) {
        ncnn::create_gpu_instance();
        g_gpu_ready = true;
    }
}

extern "C" JNIEXPORT jstring JNICALL
Java_dev_arthurdavi_ytdlpgui_AiEngine_nativeGpuName(JNIEnv* env, jobject) {
    ensure_gpu();
    if (ncnn::get_gpu_count() <= 0) return nullptr;
    return env->NewStringUTF(ncnn::get_gpu_info(ncnn::get_default_gpu_index()).device_name());
}

extern "C" JNIEXPORT void JNICALL
Java_dev_arthurdavi_ytdlpgui_AiEngine_nativeCancel(JNIEnv*, jobject) {
    g_cancel = true;
}

/** Jeito que funcionou neste aparelho: 0 = placa com fp16 (como no PC), 1 = fp16 que a placa diz aceitar, 2 = placa sem fp16, 3 = processador (-1 = ainda não provado) */
static int g_rife_mode = -1;

static std::unique_ptr<RIFE> rife_make(const std::string& model, int mode) {
    std::unique_ptr<RIFE> r(new RIFE(mode == 3 ? -1 : ncnn::get_default_gpu_index(), false, false, false, mode == 3 ? 4 : 1, false, true));
    r->fp16_mode = mode == 3 ? 2 : mode;
    if (r->load(model) != 0) return nullptr;
    return r;
}

/** Prova: entre duas imagens iguais, o quadro do meio tem que sair igual a elas (brilho médio). 256 px: menor que isso a rede não funciona */
static bool rife_ok(RIFE& rife) {
    const int w = 256, h = 256;
    std::vector<unsigned char> px(w * h * 3);
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++) {
            unsigned char* p = &px[(y * w + x) * 3];
            p[0] = (unsigned char)(40 + x * 3 / 4);
            p[1] = (unsigned char)(40 + y * 3 / 4);
            p[2] = 128;
        }
    ncnn::Mat a(w, h, (void*)px.data(), (size_t)3, 3);
    ncnn::Mat out(w, h, (size_t)3, 3);
    if (rife.process(a, a, 0.5f, out) != 0) return false;
    double si = 0, so = 0;
    for (unsigned char v : px) si += v;
    const unsigned char* o = (const unsigned char*)out.data;
    for (size_t i = 0; i < px.size(); i++) so += o[i];
    LOG("rife prova: entrada %.1f, saida %.1f", si / px.size(), so / px.size());
    return std::fabs(si - so) / px.size() < 12;
}

/**
 * RIFE v4: gera `frames` quadros a partir dos N de entrada. A saída i fica na posição i·N/frames da entrada;
 * quando cai num quadro inteiro, ele é copiado; no meio, a IA cria o quadro com o timestep da fração.
 */
extern "C" JNIEXPORT jint JNICALL
Java_dev_arthurdavi_ytdlpgui_AiEngine_nativeRife(JNIEnv* env, jobject, jstring jmodel, jstring jin, jstring jout, jint frames) {
    g_cancel = false;
    ensure_gpu();
    if (ncnn::get_gpu_count() <= 0) return -2;
    const std::string inDir = str(env, jin), outDir = str(env, jout);
    const auto files = pngs(inDir);
    if (files.size() < 2) return -3;
    const std::string model = str(env, jmodel);
    std::unique_ptr<RIFE> rp;
    if (g_rife_mode >= 0) rp = rife_make(model, g_rife_mode);
    else {
        // Primeira vez: o primeiro jeito que passa na prova fica valendo (se nenhum passar, vai o da placa)
        for (int m = 0; m <= 3 && g_rife_mode < 0; m++) {
            rp = rife_make(model, m);
            if (!rp) return -4;
            const bool ok = rife_ok(*rp);
            LOG("rife modo %d: %s", m, ok ? "certo" : "errado");
            if (ok) g_rife_mode = m;
        }
        if (g_rife_mode < 0) {
            g_rife_mode = 0;
            rp = rife_make(model, 0);
        }
    }
    if (!rp) return -4;
    RIFE& rife = *rp;

    const int n = (int)files.size();
    int cached = -1;
    Img a, b;
    Img* pa = nullptr;
    for (int i = 0; i < frames; i++) {
        if (g_cancel) return -9;
        const double pos = (double)i * n / frames;
        int i0 = (int)std::floor(pos);
        float t = (float)(pos - i0);
        if (i0 >= n - 1) { i0 = n - 1; t = 0.f; }
        // Mantém os dois quadros da vez na memória (a maioria das saídas cai entre os mesmos dois)
        if (cached != i0) {
            a.~Img(); new (&a) Img();
            b.~Img(); new (&b) Img();
            if (!load(inDir + "/" + files[i0], a)) return -5;
            if (i0 + 1 < n && !load(inDir + "/" + files[i0 + 1], b)) return -5;
            cached = i0;
            pa = &a;
        }
        const std::string out = outDir + "/" + num(i + 1);
        if (t < 1e-4f || i0 + 1 >= n) {
            if (!stbi_write_png(out.c_str(), pa->w, pa->h, 3, pa->data, 0)) return -6;
            continue;
        }
        ncnn::Mat res(a.w, a.h, (size_t)3, 3);
        if (rife.process(a.mat(), b.mat(), t, res) != 0) return -7;
        if (!save(out, res)) return -6;
    }
    return 0;
}

/** Real-ESRGAN só no processador: lento, mas não depende da placa (teste e plano B) */
static jint esrgan_cpu(const std::string& model, const std::string& inDir, const std::string& outDir, const std::vector<std::string>& files, int scale) {
    ncnn::Net net;
    net.opt.use_vulkan_compute = false;
    net.opt.num_threads = 4;
    if (net.load_param((model + "/x" + std::to_string(scale) + ".param").c_str()) != 0) return -4;
    if (net.load_model((model + "/x" + std::to_string(scale) + ".bin").c_str()) != 0) return -4;
    const float norm[3] = {1 / 255.f, 1 / 255.f, 1 / 255.f};
    const float denorm[3] = {255.f, 255.f, 255.f};
    for (const auto& f : files) {
        if (g_cancel) return -9;
        Img in;
        if (!load(inDir + "/" + f, in)) return -5;
        ncnn::Mat m = ncnn::Mat::from_pixels(in.data, ncnn::Mat::PIXEL_RGB, in.w, in.h);
        m.substract_mean_normalize(nullptr, norm);
        ncnn::Extractor ex = net.create_extractor();
        ex.input("data", m);
        ncnn::Mat o;
        if (ex.extract("output", o) != 0) return -7;
        o.substract_mean_normalize(nullptr, denorm);
        ncnn::Mat px(o.w, o.h, (size_t)3, 3);
        o.to_pixels((unsigned char*)px.data, ncnn::Mat::PIXEL_RGB);
        if (!save(outDir + "/" + f, px)) return -6;
    }
    return 0;
}

/** Real-ESRGAN na placa. fp16: 0 = ligado (como no PC), 1 = o que a placa diz aceitar, 2 = desligado */
static std::unique_ptr<RealESRGAN> esrgan_gpu(const std::string& model, int scale, int fp16) {
    const int gpu = ncnn::get_default_gpu_index();
    std::unique_ptr<RealESRGAN> net(new RealESRGAN(gpu, false));
    const ncnn::GpuInfo& info = ncnn::get_gpu_info(gpu);
    net->net.opt.use_fp16_packed = fp16 == 0 || (fp16 == 1 && info.support_fp16_packed());
    net->net.opt.use_fp16_storage = fp16 == 0 || (fp16 == 1 && info.support_fp16_storage());
    net->net.opt.use_fp16_arithmetic = false;
    if (net->load(model + "/x" + std::to_string(scale) + ".param", model + "/x" + std::to_string(scale) + ".bin") != 0) return nullptr;
    net->scale = scale;
    net->prepadding = 10;
    // Blocos pequenos: a memória de vídeo do celular é dividida com o resto do sistema
    const uint32_t heap = ncnn::get_gpu_device(gpu)->get_heap_budget();
    net->tilesize = heap > 1900 ? 200 : heap > 550 ? 100 : 32;
    return net;
}

/**
 * Prova numa imagem pequena: a saída tem que ter o mesmo brilho médio da entrada. Algumas placas (e o
 * emulador) dizem aceitar fp16, mas a rede sai preta com ele.
 */
static bool esrgan_ok(RealESRGAN& net, int scale) {
    const int w = 48, h = 48;
    std::vector<unsigned char> px(w * h * 3);
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++) {
            unsigned char* p = &px[(y * w + x) * 3];
            p[0] = (unsigned char)(40 + x * 4);
            p[1] = (unsigned char)(40 + y * 4);
            p[2] = 128;
        }
    ncnn::Mat in(w, h, (void*)px.data(), (size_t)3, 3);
    ncnn::Mat out(w * scale, h * scale, (size_t)3, 3);
    if (net.process(in, out) != 0) return false;
    double si = 0, so = 0;
    for (unsigned char v : px) si += v;
    const unsigned char* o = (const unsigned char*)out.data;
    const size_t n = (size_t)out.w * out.h * 3;
    for (size_t i = 0; i < n; i++) so += o[i];
    const double mi = si / px.size(), mo = so / n;
    LOG("esrgan prova: entrada %.1f, saida %.1f", mi, mo);
    return std::fabs(mi - mo) < 12;
}

/** Jeito que funcionou neste aparelho: 0 a 2 = placa com o fp16 de esrgan_gpu, 3 = processador (-1 = ainda não provado) */
static int g_esr_mode = -1;

/** Real-ESRGAN (realesr-animevideov3) em 2x: cada PNG da entrada vira um PNG maior na saída */
extern "C" JNIEXPORT jint JNICALL
Java_dev_arthurdavi_ytdlpgui_AiEngine_nativeEsrgan(JNIEnv* env, jobject, jstring jmodel, jstring jin, jstring jout, jint scale, jint flags) {
    g_cancel = false;
    const std::string model = str(env, jmodel), inDir = str(env, jin), outDir = str(env, jout);
    const auto files = pngs(inDir);
    if (files.empty()) return -3;
    // flags (testes): 1 a 4 escolhem o jeito (flags - 1), sem prova
    int mode = flags ? flags - 1 : g_esr_mode;
    std::unique_ptr<RealESRGAN> net;
    if (mode != 3) {
        ensure_gpu();
        if (ncnn::get_gpu_count() <= 0) mode = 3;
    }
    if (mode == -1) {
        // Primeira vez: o primeiro jeito que passa na prova fica valendo (se nenhum na placa passar, vai no processador)
        for (int m = 0; m <= 2 && mode < 0; m++) {
            net = esrgan_gpu(model, scale, m);
            if (!net) return -4;
            const bool ok = esrgan_ok(*net, scale);
            LOG("esrgan modo %d: %s", m, ok ? "certo" : "errado");
            if (ok) mode = m;
            else net.reset();
        }
        if (mode < 0) mode = 3;
        g_esr_mode = mode;
    } else if (mode != 3) {
        net = esrgan_gpu(model, scale, mode);
        if (!net) return -4;
    }
    if (mode == 3) return esrgan_cpu(model, inDir, outDir, files, scale);
    for (const auto& f : files) {
        if (g_cancel) return -9;
        Img in;
        if (!load(inDir + "/" + f, in)) return -5;
        ncnn::Mat out(in.w * scale, in.h * scale, (size_t)3, 3);
        if (net->process(in.mat(), out) != 0) return -7;
        if (!save(outDir + "/" + f, out)) return -6;
    }
    return 0;
}
