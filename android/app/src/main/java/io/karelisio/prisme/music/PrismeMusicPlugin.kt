package io.karelisio.prisme.music

import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import io.karelisio.prisme.system.ErrorLog
import io.karelisio.prisme.wallpaper.WallpaperTarget
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Pont de la pochette de la musique : accès aux notifications, réglages et état (voir [MusicArtwork]). */
@CapacitorPlugin(name = "PrismeMusic")
class PrismeMusicPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val state = MusicState(context)
        call.resolve(
            JSObject()
                .put("accessGranted", MusicArtwork.accessGranted(context))
                .put("enabled", state.enabled)
                .put("showing", state.showing),
        )
    }

    /** Ouvre la liste Android des applis autorisées à lire les notifications, où l'utilisateur active Prisme. */
    @PluginMethod
    fun openAccessSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        try {
            val host = activity
            if (host != null) {
                host.startActivity(intent)
            } else {
                context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            call.resolve()
        } catch (e: ActivityNotFoundException) {
            call.reject("Réglages d'accès aux notifications introuvables sur cet appareil", "UNSUPPORTED", e)
        }
    }

    /** Couper l'option pendant l'affichage d'une pochette fait revenir le fond précédent. */
    @PluginMethod
    fun configure(call: PluginCall) {
        val target = WallpaperTarget.fromKey(call.getString("target", "both"))
        if (target == null) {
            call.reject("Écran invalide", "INVALID_ARGUMENT")
            return
        }
        val enabled = call.getBoolean("enabled", false) == true
        val restore = call.getBoolean("restore", true) != false
        scope.launch {
            val failure = withContext(Dispatchers.IO) {
                runCatching { MusicArtwork.configure(context, enabled, target, restore) }
                    .onFailure { ErrorLog.record(context, "Pochette", it) }
                    .exceptionOrNull()
            }
            if (failure == null) call.resolve() else call.reject(failure.message ?: "Erreur inattendue", "UNKNOWN")
        }
    }
}
