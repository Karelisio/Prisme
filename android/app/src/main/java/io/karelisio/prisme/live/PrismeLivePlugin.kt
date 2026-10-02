package io.karelisio.prisme.live

import android.app.WallpaperManager
import android.content.ActivityNotFoundException
import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import io.karelisio.prisme.wallpaper.NormalizedRect
import io.karelisio.prisme.wallpaper.ScreenInfo
import io.karelisio.prisme.wallpaper.WallpaperException
import io.karelisio.prisme.wallpaper.WallpaperRef
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Prépare l'image du fond animé puis ouvre l'écran système de confirmation si besoin ; prépare aussi les
 * images du changement à chaque déverrouillage.
 */
@CapacitorPlugin(name = "PrismeLive")
class PrismeLivePlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val config = LiveWallpaperStore.read(context)
        call.resolve(
            JSObject()
                .put("active", LiveWallpaperStore.isActive(context))
                .put("intensity", config.intensity.toDouble())
                .put("configured", config.path != null)
                .put(
                    "playlist",
                    JSObject()
                        .put("enabled", config.playlist.enabled)
                        .put("count", config.playlist.paths.size)
                        .put("every", config.playlist.every),
                ),
        )
    }

    @PluginMethod
    fun setLiveWallpaper(call: PluginCall) {
        val uri = call.getString("uri")
        if (uri.isNullOrBlank()) {
            call.reject("Image manquante", "INVALID_ARGUMENT")
            return
        }
        val intensity = (call.getFloat("intensity") ?: LiveWallpaperStore.DEFAULT_INTENSITY).coerceIn(0f, 1f)
        val crop = WallpaperRef.cropFromJson(call.getObject("crop"))
        val screen = ScreenInfo.read(context, activity)
        scope.launch {
            try {
                val path = withContext(Dispatchers.IO) { prepare(uri, intensity, crop, screen) }
                LiveWallpaperStore.write(context, path, intensity)
                if (LiveWallpaperStore.isActive(context)) {
                    call.resolve(JSObject().put("status", "updated"))
                } else {
                    openSystemPicker()
                    call.resolve(JSObject().put("status", "launched"))
                }
            } catch (e: WallpaperException) {
                call.reject(e.message, e.code, e)
            } catch (e: ActivityNotFoundException) {
                call.reject("Fonds animés non pris en charge sur cet appareil", "UNSUPPORTED")
            } catch (e: Exception) {
                call.reject(e.message ?: "Erreur inattendue", "UNKNOWN", e)
            }
        }
    }

    /**
     * Active ou coupe le changement à chaque déverrouillage. La liste est enregistrée tout de suite et les
     * images sont préparées en arrière-plan (état dans `getStatus`) ; la réponse donne celles déjà prêtes.
     */
    @PluginMethod
    fun setPlaylist(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) == true
        val every = UnlockPlaylist.clampEvery(call.getInt("every") ?: UnlockPlaylist.DEFAULT_EVERY)
        val array = call.getArray("items")
        if (enabled && array == null) {
            call.reject("Liste d'images manquante", "INVALID_ARGUMENT")
            return
        }
        val items = if (array == null) emptyList() else (0 until array.length()).mapNotNull { WallpaperRef.fromJson(array.optJSONObject(it)) }
        scope.launch {
            try {
                val count = withContext(Dispatchers.IO) { LivePlaylist.update(context, enabled, every, items) }
                call.resolve(JSObject().put("enabled", enabled).put("count", count))
            } catch (e: Exception) {
                call.reject(e.message ?: "Erreur inattendue", "UNKNOWN", e)
            }
        }
    }

    /** Prépare l'image à la taille de l'écran plus la marge de parallaxe, dans un nouveau fichier. */
    private fun prepare(uri: String, intensity: Float, crop: NormalizedRect?, screen: ScreenInfo.Size): String {
        val dir = File(context.filesDir, "live").apply { mkdirs() }
        // Nom unique : le service détecte le changement et recharge l'image.
        val out = File(dir, "live-${System.currentTimeMillis()}.jpg")
        LiveImages(context).prepareTo(uri, intensity, crop, screen, out)
        dir.listFiles()?.filter { it != out }?.forEach { it.delete() }
        return out.absolutePath
    }

    private fun openSystemPicker() {
        val intent = Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER)
            .putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, LiveWallpaperStore.component(context))
        try {
            activity.startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            activity.startActivity(Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER))
        }
    }
}
