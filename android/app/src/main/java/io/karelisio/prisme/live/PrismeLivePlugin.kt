package io.karelisio.prisme.live

import android.app.WallpaperManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import io.karelisio.prisme.system.ErrorLog
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
                .put("mode", config.mode.key)
                .put("eco", config.eco)
                .put("doubleTap", config.doubleTap)
                // Fond figé en ce moment (économie d'énergie ou batterie faible), si la pause est activée.
                .put("paused", config.eco && EcoMonitor.isLowPower(context))
                .put(
                    "playlist",
                    JSObject()
                        .put("enabled", config.playlist.enabled)
                        .put("count", config.playlist.paths.size)
                        .put("every", config.playlist.every)
                        .put("unlock", config.playlist.unlock),
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
     * Genre de fond animé, options communes (pause en économie de batterie, double-tap) et réglages propres
     * au genre (`settings`, objet libre lu par la scène). Le service suit aussitôt s'il est actif.
     */
    @PluginMethod
    fun configure(call: PluginCall) {
        val mode = LiveMode.fromKey(call.getString("mode"))
        val eco = call.getBoolean("eco", true) != false
        val doubleTap = call.getBoolean("doubleTap", false) == true
        // Réglages d'abord : la nouvelle scène les trouve en démarrant.
        call.getObject("settings")?.let { LiveWallpaperStore.saveSceneSettings(context, mode, it) }
        LiveWallpaperStore.configure(context, mode, eco, doubleTap)
        call.resolve(JSObject().put("active", LiveWallpaperStore.isActive(context)))
    }

    /** Ouvre l'écran d'Android qui active le fond animé Prisme ; sans effet s'il est déjà actif. */
    @PluginMethod
    fun activate(call: PluginCall) {
        if (LiveWallpaperStore.isActive(context)) {
            call.resolve(JSObject().put("status", "active"))
            return
        }
        try {
            openSystemPicker()
            call.resolve(JSObject().put("status", "launched"))
        } catch (e: ActivityNotFoundException) {
            call.reject("Fonds animés non pris en charge sur cet appareil", "UNSUPPORTED")
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
        // Sans « unlock », la liste ne sert qu'au double-tap.
        val unlock = call.getBoolean("unlock", true) != false
        val array = call.getArray("items")
        if (enabled && array == null) {
            call.reject("Liste d'images manquante", "INVALID_ARGUMENT")
            return
        }
        val items = if (array == null) emptyList() else (0 until array.length()).mapNotNull { WallpaperRef.fromJson(array.optJSONObject(it)) }
        scope.launch {
            try {
                val count = withContext(Dispatchers.IO) { LivePlaylist.update(context, enabled, every, items, unlock) }
                call.resolve(JSObject().put("enabled", enabled).put("count", count))
            } catch (e: Exception) {
                call.reject(e.message ?: "Erreur inattendue", "UNKNOWN", e)
            }
        }
    }

    /**
     * Relief 3D : détoure le sujet de la photo et comble l'arrière-plan derrière lui, hors du fil principal ;
     * les étapes sont annoncées par l'événement « reliefProgress ». En cas d'échec, le relief précédent reste.
     */
    @PluginMethod
    fun prepareRelief(call: PluginCall) {
        val uri = call.getString("uri")
        if (uri.isNullOrBlank()) {
            call.reject("Image manquante", "INVALID_ARGUMENT")
            return
        }
        val crop = WallpaperRef.cropFromJson(call.getObject("crop"))
        val screen = ScreenInfo.read(context, activity)
        scope.launch {
            try {
                val info = withContext(Dispatchers.IO) {
                    val prepared = ReliefPreparer(context).prepare(uri, crop, screen) { stage, progress ->
                        val data = JSObject().put("stage", stage.key)
                        if (progress != null) data.put("progress", progress.toDouble())
                        bridge.executeOnMainThread { notifyListeners(EVENT_RELIEF_PROGRESS, data) }
                    }
                    ReliefPreparer.info(context, prepared)
                }
                call.resolve(info)
            } catch (e: WallpaperException) {
                call.reject(e.message, e.code, e)
            } catch (e: Exception) {
                // Erreur imprévue : gardée pour l'écran Diagnostic (écriture hors du fil principal).
                withContext(Dispatchers.IO) { ErrorLog.record(context, "Relief 3D", e) }
                call.reject(e.message ?: "Erreur inattendue", "UNKNOWN", e)
            }
        }
    }

    /** Relief 3D : prêt ou non, avec la vignette du sujet détouré. */
    @PluginMethod
    fun getRelief(call: PluginCall) {
        scope.launch { call.resolve(withContext(Dispatchers.IO) { ReliefPreparer.info(context) }) }
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

    private fun openSystemPicker(component: ComponentName = LiveWallpaperStore.component(context)) {
        val intent = Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER)
            .putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, component)
        try {
            activity.startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            activity.startActivity(Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER))
        }
    }

    private companion object {
        /** Étape de la préparation du relief 3D : `stage`, et `progress` (0..1) si elle est connue. */
        const val EVENT_RELIEF_PROGRESS = "reliefProgress"
    }
}
