package dev.arthurdavi.ytdlpgui

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Ponte entre a tela (JavaScript) e o Android: roda o yt-dlp (Python da youtubedl-android) e o ffmpeg linha a linha,
 * com progresso e cancelamento; escolhe vídeos da galeria; publica os arquivos prontos em Download/yt-dlp GUI;
 * baixa os modelos das IAs e chama o motor nativo (ncnn) delas.
 */
@CapacitorPlugin(name = "Engine")
class EnginePlugin : Plugin() {
    private val pool = Executors.newCachedThreadPool()
    private val procs = ConcurrentHashMap<String, Process>()
    private val canceled = ConcurrentHashMap.newKeySet<String>()
    private var ready = false
    private var env: Map<String, String> = emptyMap()
    private lateinit var python: File
    private lateinit var ytdlp: File
    private lateinit var ffmpeg: File

    /** Prepara o yt-dlp e o ffmpeg (a biblioteca extrai o Python e as bibliotecas na 1ª vez) */
    @Synchronized
    private fun setup() {
        if (ready) return
        val ctx = context.applicationContext
        YoutubeDL.getInstance().init(ctx)
        FFmpeg.getInstance().init(ctx)
        // Os mesmos caminhos e variáveis que a youtubedl-android usa; aqui o processo é nosso, para ler o progresso linha a linha
        val bin = File(ctx.applicationInfo.nativeLibraryDir)
        val base = File(ctx.noBackupFilesDir, "youtubedl-android")
        val pkgs = File(base, "packages")
        python = File(bin, "libpython.so")
        ffmpeg = File(bin, "libffmpeg.so")
        ytdlp = File(File(base, "yt-dlp"), "yt-dlp")
        val pyDir = File(pkgs, "python")
        env = mapOf(
            "LD_LIBRARY_PATH" to "${pyDir.absolutePath}/usr/lib:${File(pkgs, "ffmpeg").absolutePath}/usr/lib",
            "SSL_CERT_FILE" to "${pyDir.absolutePath}/usr/etc/tls/cert.pem",
            "PYTHONHOME" to "${pyDir.absolutePath}/usr",
            "HOME" to "${pyDir.absolutePath}/usr",
            "TMPDIR" to ctx.cacheDir.absolutePath,
            "PATH" to System.getenv("PATH") + ":" + bin.absolutePath
        )
        ready = true
    }

    private fun bg(call: PluginCall, block: () -> Unit) {
        pool.execute {
            try {
                block()
            } catch (e: Throwable) {
                call.reject(e.message ?: e.toString())
            }
        }
    }

    private fun progress(id: String, percent: Double?, line: String) {
        val o = JSObject()
        o.put("id", id)
        o.put("percent", percent)
        o.put("line", line)
        notifyListeners("progress", o)
    }

    /** Roda um programa, manda cada linha de saída como progresso e devolve código, saída e erros */
    private fun run(id: String, cmd: List<String>, onLine: (String) -> Unit): JSObject {
        val pb = ProcessBuilder(cmd)
        pb.environment().putAll(env)
        val p = pb.start()
        procs[id] = p
        val out = StringBuilder()
        val err = StringBuilder()
        val tOut = Thread {
            p.inputStream.bufferedReader().forEachLine { l ->
                out.append(l).append('\n')
                onLine(l)
            }
        }
        val tErr = Thread {
            p.errorStream.bufferedReader().forEachLine { l ->
                err.append(l).append('\n')
                if (err.length > 20000) err.delete(0, err.length - 20000)
                onLine(l)
            }
        }
        tOut.start()
        tErr.start()
        val code = p.waitFor()
        tOut.join()
        tErr.join()
        procs.remove(id)
        val r = JSObject()
        r.put("code", if (canceled.remove(id)) 130 else code)
        r.put("out", out.toString())
        r.put("err", err.toString())
        return r
    }

    /** Versão do yt-dlp perguntada a ele mesmo (a da biblioteca só existe depois de uma atualização) */
    private fun ytdlpVersion(): String? = try {
        val v = run("versao", listOf(python.absolutePath, ytdlp.absolutePath, "--version")) {}.getString("out")?.trim()
        if (v.isNullOrEmpty()) YoutubeDL.getInstance().version(context.applicationContext) else v.lines().last()
    } catch (e: Throwable) {
        YoutubeDL.getInstance().version(context.applicationContext)
    }

    @PluginMethod
    fun init(call: PluginCall) = bg(call) {
        setup()
        val r = JSObject()
        r.put("ytdlp", ytdlpVersion())
        r.put("ffmpeg", ffmpeg.exists())
        val gpu = AiEngine.gpuName()
        r.put("vulkan", gpu != null)
        r.put("gpu", gpu)
        // Para o aviso de versão nova escolher o APK certo (arm64-v8a nos celulares, x86_64 no emulador)
        r.put("abi", android.os.Build.SUPPORTED_ABIS.firstOrNull())
        call.resolve(r)
    }

    @PluginMethod
    fun ytdlp(call: PluginCall) = bg(call) {
        setup()
        val id = call.getString("id")!!
        val args = call.getArray("args").toList<String>()
        val cmd = listOf(python.absolutePath, ytdlp.absolutePath, "--no-cache-dir", "--ffmpeg-location", ffmpeg.absolutePath) + args
        val rx = Regex("""\[download\]\s+([\d.]+)%""")
        call.resolve(run(id, cmd) { l -> rx.find(l)?.let { progress(id, it.groupValues[1].toDoubleOrNull(), l) } })
    }

    @PluginMethod
    fun ffmpeg(call: PluginCall) = bg(call) {
        setup()
        val id = call.getString("id")!!
        val args = call.getArray("args").toList<String>()
        // As pastas de saída (quadros, pedaços) são criadas antes
        args.lastOrNull()?.let { File(it).parentFile?.mkdirs() }
        call.resolve(run(id, listOf(ffmpeg.absolutePath) + args) { l -> if (l.startsWith("out_time_us=")) progress(id, null, l) })
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val id = call.getString("id")!!
        canceled.add(id)
        procs[id]?.destroy()
        AiEngine.cancel()
        call.resolve()
    }

    @PluginMethod
    fun probe(call: PluginCall) = bg(call) {
        val path = call.getString("path")!!
        val m = MediaMetadataRetriever()
        m.setDataSource(path)
        val rot = m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        var w = m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
        var h = m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
        if (rot % 180 != 0) w = h.also { h = w }
        val dur = (m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0) / 1000
        val frames = if (Build.VERSION.SDK_INT >= 28) m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)?.toDoubleOrNull() else null
        val fpsMeta = m.extractMetadata(25 /* METADATA_KEY_CAPTURE_FRAMERATE */)?.toDoubleOrNull()
        val hasAudio = m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes"
        m.release()
        val r = JSObject()
        r.put("width", w)
        r.put("height", h)
        r.put("duration", dur)
        r.put("fps", if (frames != null && dur > 0) Math.round(frames / dur * 100) / 100.0 else fpsMeta ?: 30.0)
        r.put("hasAudio", hasAudio)
        call.resolve(r)
    }

    @PluginMethod
    fun frame(call: PluginCall) = bg(call) {
        val m = MediaMetadataRetriever()
        m.setDataSource(call.getString("path")!!)
        val bmp = m.getFrameAtTime((call.getDouble("time") ?: 1.0).times(1_000_000).toLong(), MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
        m.release()
        val r = JSObject()
        if (bmp != null) {
            val width = call.getInt("width") ?: 480
            val scaled = Bitmap.createScaledBitmap(bmp, width, (bmp.height * width / bmp.width.toFloat()).toInt(), true)
            val bos = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, 80, bos)
            r.put("data", "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP))
        } else r.put("data", null)
        call.resolve(r)
    }

    /** Galeria do sistema; o vídeo escolhido é copiado para o app (o ffmpeg precisa de um caminho de arquivo) */
    @PluginMethod
    fun pickVideo(call: PluginCall) {
        val i = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "video/*"
            addCategory(Intent.CATEGORY_OPENABLE)
        }
        startActivityForResult(call, i, "picked")
    }

    @ActivityCallback
    private fun picked(call: PluginCall, result: ActivityResult) {
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            val r = JSObject()
            r.put("path", null)
            r.put("name", null)
            return call.resolve(r)
        }
        bg(call) {
            var name = "video.mp4"
            context.contentResolver.query(uri, null, null, null, null)?.use { c ->
                val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (c.moveToFirst() && idx >= 0) name = c.getString(idx)
            }
            val dir = File(context.cacheDir, "escolhidos").apply { mkdirs() }
            val out = File(dir, name.replace(Regex("""[\\/:*?"<>|]"""), "_"))
            context.contentResolver.openInputStream(uri)!!.use { inp -> out.outputStream().use { inp.copyTo(it) } }
            val r = JSObject()
            r.put("path", out.absolutePath)
            r.put("name", name)
            call.resolve(r)
        }
    }

    /** Copia o arquivo pronto para Download/yt-dlp GUI (aparece na galeria e no app Arquivos) */
    @PluginMethod
    fun publish(call: PluginCall) = bg(call) {
        val src = File(call.getString("path")!!)
        val name = call.getString("name") ?: src.name
        val mime = call.getString("mime") ?: "video/mp4"
        val uri: Uri
        if (Build.VERSION.SDK_INT >= 29) {
            val v = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/yt-dlp GUI")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val res = context.contentResolver
            uri = res.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v)!!
            res.openOutputStream(uri)!!.use { o -> src.inputStream().use { it.copyTo(o) } }
            v.clear()
            v.put(MediaStore.Downloads.IS_PENDING, 0)
            res.update(uri, v, null, null)
        } else {
            val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "yt-dlp GUI").apply { mkdirs() }
            val out = File(dir, name)
            src.copyTo(out, overwrite = true)
            uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", out)
        }
        val r = JSObject()
        r.put("uri", uri.toString())
        call.resolve(r)
    }

    @PluginMethod
    fun open(call: PluginCall) {
        val i = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(Uri.parse(call.getString("uri")), call.getString("mime") ?: "video/mp4")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(Intent.createChooser(i, null))
        call.resolve()
    }

    /** Abre um link no navegador do celular (ex.: o APK da versão nova; o navegador baixa e o Android instala) */
    @PluginMethod
    fun openUrl(call: PluginCall) {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(call.getString("url"))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(i)
        call.resolve()
    }

    @PluginMethod
    fun share(call: PluginCall) {
        val i = Intent(Intent.ACTION_SEND).apply {
            type = call.getString("mime") ?: "video/mp4"
            putExtra(Intent.EXTRA_STREAM, Uri.parse(call.getString("uri")))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivity(Intent.createChooser(i, null))
        call.resolve()
    }

    /** Baixa um arquivo (modelos das IAs) com progresso; grava num .part e só renomeia no fim */
    @PluginMethod
    fun fetchFile(call: PluginCall) = bg(call) {
        val id = call.getString("id")!!
        val dest = File(call.getString("path")!!)
        val size = call.getLong("size") ?: 0L
        // Pacote com vários arquivos: o progresso é do pacote inteiro (já baixado antes + este arquivo)
        val base = call.getLong("base") ?: 0L
        val whole = call.getLong("whole") ?: 0L
        dest.parentFile?.mkdirs()
        val part = File(dest.path + ".part")
        val r = JSObject()
        try {
            var url = URL(call.getString("url"))
            var conn = url.openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("User-Agent", "ytdlp-studio")
            // O GitHub manda para outro endereço; segue à mão se o Android não seguir (https → https funciona, mas por garantia)
            var hops = 0
            while (conn.responseCode in 300..399 && hops++ < 5) {
                url = URL(url, conn.getHeaderField("Location"))
                conn = url.openConnection() as HttpURLConnection
                conn.setRequestProperty("User-Agent", "ytdlp-studio")
            }
            if (conn.responseCode != 200) throw Exception("HTTP ${conn.responseCode}")
            val total = if (conn.contentLengthLong > 0) conn.contentLengthLong else size
            var got = 0L
            conn.inputStream.use { inp ->
                part.outputStream().use { o ->
                    val buf = ByteArray(65536)
                    while (true) {
                        if (canceled.remove(id)) throw Exception("Cancelado")
                        val n = inp.read(buf)
                        if (n < 0) break
                        o.write(buf, 0, n)
                        got += n
                        if (whole > 0) progress(id, minOf(99.9, (base + got) * 100.0 / whole), "")
                        else if (total > 0) progress(id, minOf(99.9, got * 100.0 / total), "")
                    }
                }
            }
            if (total > 0 && got != total) throw Exception("download incompleto")
            dest.delete()
            part.renameTo(dest)
            if (whole <= 0 || base + got >= whole) progress(id, 100.0, "")
            r.put("ok", true)
            r.put("error", null)
        } catch (e: Exception) {
            part.delete()
            r.put("ok", false)
            r.put("error", e.message)
        }
        call.resolve(r)
    }

    @PluginMethod
    fun exists(call: PluginCall) {
        val r = JSObject()
        r.put("exists", File(call.getString("path")!!).exists())
        call.resolve(r)
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val path = File(call.getString("path")!!)
        // Com "prefix": apaga só o que, dentro da pasta, começa com ele (os temporários de um trabalho)
        val prefix = call.getString("prefix")
        if (prefix.isNullOrEmpty()) path.deleteRecursively()
        else path.listFiles()?.filter { it.name.startsWith(prefix) }?.forEach { it.deleteRecursively() }
        call.resolve()
    }

    @PluginMethod
    fun writeText(call: PluginCall) {
        val f = File(call.getString("path")!!)
        f.parentFile?.mkdirs()
        f.writeText(call.getString("text") ?: "")
        call.resolve()
    }

    @PluginMethod
    fun dirs(call: PluginCall) {
        val r = JSObject()
        r.put("files", context.filesDir.absolutePath)
        r.put("cache", context.cacheDir.absolutePath)
        call.resolve(r)
    }

    /** IA no motor nativo; o progresso é contado pelos quadros que já foram gravados na pasta de saída */
    @PluginMethod
    fun ai(call: PluginCall) = bg(call) {
        val id = call.getString("id")!!
        val kind = call.getString("kind")!!
        val inDir = call.getString("inDir")!!
        val outDir = File(call.getString("outDir")!!).apply { mkdirs() }
        val inCount = File(inDir).list()?.size ?: 0
        val expected = if (kind == "rife") call.getInt("frames") ?: inCount else inCount
        val watcher = Thread {
            try {
                while (true) {
                    Thread.sleep(500)
                    progress(id, (outDir.list()?.size ?: 0) * 100.0 / maxOf(1, expected), "")
                }
            } catch (_: InterruptedException) {
            }
        }
        watcher.start()
        val code = if (kind == "rife") AiEngine.rife(call.getString("model")!!, inDir, outDir.absolutePath, expected)
        else AiEngine.esrgan(call.getString("model")!!, inDir, outDir.absolutePath, call.getInt("scale") ?: 2, call.getInt("flags") ?: 0)
        watcher.interrupt()
        val r = JSObject()
        r.put("code", if (canceled.remove(id)) 130 else code)
        r.put("out", "")
        r.put("err", if (code == 0) "" else "erro ${code} na IA")
        call.resolve(r)
    }

    @PluginMethod
    fun updateYtdlp(call: PluginCall) = bg(call) {
        setup()
        val st = YoutubeDL.getInstance().updateYoutubeDL(context.applicationContext, YoutubeDL.UpdateChannel._STABLE)
        val r = JSObject()
        r.put("status", st?.name ?: "ERROR")
        r.put("version", ytdlpVersion())
        call.resolve(r)
    }

    /** Link que chegou pelo "Compartilhar" de outro app */
    @PluginMethod
    fun takeShared(call: PluginCall) {
        val r = JSObject()
        r.put("url", MainActivity.pendingShared)
        MainActivity.pendingShared = null
        call.resolve(r)
    }

    fun emitShared(url: String) {
        val o = JSObject()
        o.put("url", url)
        notifyListeners("shared", o)
    }

    @Suppress("unused")
    private fun JSArray.toStrings(): List<String> = (0 until length()).map { getString(it) }
}
