package io.karelisio.prisme.quote

import android.app.WallpaperManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import io.karelisio.prisme.system.ErrorLog
import io.karelisio.prisme.wallpaper.CurrentWallpapers
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Pont de la citation du jour : réglages et phrases envoyés par l'app, état des fonds (voir [QuoteRenewal]). */
@CapacitorPlugin(name = "PrismeQuote")
class PrismeQuotePlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    /**
     * Enregistre les réglages et la liste des phrases, programme le renouvellement de 6 h et réapplique tout de
     * suite les fonds Prisme si le rendu change (phrase du jour, style, écran, option coupée).
     */
    @PluginMethod
    fun configure(call: PluginCall) {
        val raw = call.data.toString()
        scope.launch {
            val failure = withContext(Dispatchers.IO) {
                runCatching { QuoteRenewal.configure(context, raw) }
                    .onFailure { ErrorLog.record(context, "Citation du jour", it) }
                    .exceptionOrNull()
            }
            if (failure == null) call.resolve() else call.reject(failure.message ?: "Erreur inattendue", "UNKNOWN")
        }
    }

    /**
     * Fonds dont l'original est gardé (la phrase peut s'y ajouter) et écrans occupés par un fond animé (où
     * rien n'est posé).
     */
    @PluginMethod
    fun getStatus(call: PluginCall) {
        scope.launch {
            val status = withContext(Dispatchers.IO) {
                val wallpapers = CurrentWallpapers(context)
                val manager = WallpaperManager.getInstance(context)
                JSObject()
                    .put("home", wallpapers.hasOriginal(QuoteScreen.HOME))
                    .put("lock", wallpapers.hasOriginal(QuoteScreen.LOCK))
                    .put("homeLive", wallpapers.isLive(manager, QuoteScreen.HOME, withQuote = true))
                    .put("lockLive", wallpapers.isLive(manager, QuoteScreen.LOCK, withQuote = true))
            }
            call.resolve(status)
        }
    }
}
