package dev.arthurdavi.ytdlpgui

/**
 * Motor das IAs (ncnn com Vulkan): RIFE para quadros novos e Real-ESRGAN para melhorar a imagem.
 * O código nativo vem no app; os modelos são baixados depois, só por quem quiser usar.
 */
object AiEngine {
    private val loaded = try {
        System.loadLibrary("aiengine")
        true
    } catch (e: Throwable) {
        false
    }

    /** Nome da placa com Vulkan, ou null se não houver (aí as IAs ficam desligadas) */
    fun gpuName(): String? = if (loaded) nativeGpuName() else null

    /** Gera `frames` quadros a partir dos PNG de inDir (RIFE v4: qualquer quantidade) */
    fun rife(model: String, inDir: String, outDir: String, frames: Int): Int = if (loaded) nativeRife(model, inDir, outDir, frames) else -1

    /** Amplia cada PNG de inDir (Real-ESRGAN realesr-animevideov3) */
    fun esrgan(model: String, inDir: String, outDir: String, scale: Int, flags: Int = 0): Int = if (loaded) nativeEsrgan(model, inDir, outDir, scale, flags) else -1

    fun cancel() {
        if (loaded) nativeCancel()
    }

    private external fun nativeGpuName(): String?
    private external fun nativeRife(model: String, inDir: String, outDir: String, frames: Int): Int
    private external fun nativeEsrgan(model: String, inDir: String, outDir: String, scale: Int, flags: Int): Int
    private external fun nativeCancel()
}
