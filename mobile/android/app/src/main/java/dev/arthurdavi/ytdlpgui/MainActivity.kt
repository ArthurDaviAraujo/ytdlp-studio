package dev.arthurdavi.ytdlpgui

import android.content.Intent
import android.os.Bundle
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    companion object {
        /** Link compartilhado antes de a tela estar pronta */
        @JvmStatic
        var pendingShared: String? = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(EnginePlugin::class.java)
        super.onCreate(savedInstanceState)
        // A tela é escura: relógio, bateria e botões do sistema em claro, mesmo com o celular no tema claro
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
        takeShare(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        takeShare(intent)?.let { url ->
            (bridge?.getPlugin("Engine")?.instance as? EnginePlugin)?.emitShared(url)
        }
    }

    /** "Compartilhar" de outro app manda um texto; pega o primeiro link dele */
    private fun takeShare(i: Intent?): String? {
        if (i?.action != Intent.ACTION_SEND) return null
        val text = i.getStringExtra(Intent.EXTRA_TEXT) ?: return null
        val url = Regex("""https?://\S+""").find(text)?.value ?: return null
        pendingShared = url
        return url
    }
}
