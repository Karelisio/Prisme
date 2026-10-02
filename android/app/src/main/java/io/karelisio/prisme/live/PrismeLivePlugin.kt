package io.karelisio.prisme.live

import android.app.Activity
import android.app.WallpaperManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.os.Build
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
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
import org.json.JSONObject
import java.io.File

/**
 * Prépare l'image du fond animé puis ouvre l'écran système de confirmation si besoin ; prépare aussi les
 * images du changement à chaque déverrouillage, et copie la vidéo ou le GIF choisi dans la galerie. Deux
 * fonds animés Prisme existent dans Android (voir [LiveComponent]) : celui des scènes et celui de la vidéo.
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
        val component = LiveWallpaperStore.activeComponent(context)
        val media = JSObject()
        LiveMedia.ready(context, MediaKind.VIDEO)?.let { media.put("video", mediaJson(it)) }
        LiveMedia.ready(context, MediaKind.GIF)?.let { media.put("gif", mediaJson(it)) }
        val status =
            JSObject()
                // L'un des deux fonds animés Prisme est actif ; `component` dit lequel (null : aucun).
                .put("active", component != null)
                .put("component", component?.key ?: JSONObject.NULL)
                .put("media", media)
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
                )
        // Dernier relevé de la météo animée (lieu et heure), pour l'état affiché dans l'app.
        LiveWeather.read(context)?.let {
            status.put(
                "weather",
                JSObject()
                    .put("code", it.code)
                    .put("isDay", it.isDay)
                    .put("precipitation", it.precipitation.toDouble())
                    .put("wind", it.windKmh.toDouble())
                    .put("latitude", it.latitude)
                    .put("longitude", it.longitude)
                    .put("updatedAt", it.fetchedAt),
            )
        }
        call.resolve(status)
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
                if (LiveWallpaperStore.isActive(context, LiveComponent.SCENES)) {
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
        // Le fond qui affiche ce genre est-il actif ? (la vidéo a son service, tous les autres genres celui des scènes)
        call.resolve(JSObject().put("active", LiveWallpaperStore.isActive(context, LiveComponent.forMode(mode))))
    }

    /**
     * Ouvre l'écran d'Android qui active le fond animé des scènes (photo, GIF, dégradés…) ; sans effet s'il est déjà
     * actif. Avec le fond vidéo actif, l'écran s'ouvre quand même : c'est un autre service.
     */
    @PluginMethod
    fun activate(call: PluginCall) {
        if (LiveWallpaperStore.isActive(context, LiveComponent.SCENES)) {
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
     * Ouvre l'écran d'Android qui active le fond vidéo Prisme. Déjà actif, il suit tout seul la vidéo choisie
     * (« updated »). Il faut une vidéo prête : voir [pickMedia].
     */
    @PluginMethod
    fun activateVideo(call: PluginCall) {
        if (LiveMedia.ready(context, MediaKind.VIDEO) == null) {
            call.reject("Choisis d'abord une vidéo", "NO_MEDIA")
            return
        }
        if (LiveWallpaperStore.isActive(context, LiveComponent.VIDEO)) {
            call.resolve(JSObject().put("status", "updated"))
            return
        }
        try {
            openSystemPicker(LiveWallpaperStore.videoComponent(context))
            call.resolve(JSObject().put("status", "launched"))
        } catch (e: ActivityNotFoundException) {
            call.reject("Fonds animés non pris en charge sur cet appareil", "UNSUPPORTED")
        }
    }

    /**
     * Choix d'une vidéo (`kind` « video ») ou d'un GIF (« gif », WebP animé compris dès Android 9) dans la galerie.
     * Le fichier est copié dans l'app (le précédent du même genre est remplacé) puis décrit : `name`, `sizeBytes`,
     * `durationMs` (vidéo), `width`, `height`. Refusé s'il est trop lourd ou illisible ; `cancelled` si rien n'est choisi.
     */
    @PluginMethod
    fun pickMedia(call: PluginCall) {
        val kind = MediaKind.fromKey(call.getString("kind"))
        if (kind == null) {
            call.reject("Genre de média inconnu", "INVALID_ARGUMENT")
            return
        }
        val types = MediaRules.pickerTypes(kind, Build.VERSION.SDK_INT)
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
        if (types.size == 1) {
            intent.type = types.first()
        } else {
            intent.type = "*/*"
            intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
        }
        startActivityForResult(call, intent, "onMediaResult")
    }

    @ActivityCallback
    private fun onMediaResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        val kind = MediaKind.fromKey(call.getString("kind"))
        if (result.resultCode != Activity.RESULT_OK || uri == null || kind == null) {
            call.resolve(JSObject().put("cancelled", true))
            return
        }
        scope.launch {
            try {
                val info = withContext(Dispatchers.IO) { MediaImporter(context).importMedia(uri, kind) }
                call.resolve(mediaJson(info).put("cancelled", false))
            } catch (e: WallpaperException) {
                call.reject(e.message, e.code, e)
            } catch (e: Exception) {
                ErrorLog.record(context, "Choix de ${kind.fallbackName.lowercase()}", e)
                call.reject(e.message ?: "Erreur inattendue", "UNKNOWN", e)
            }
        }
    }

    private fun mediaJson(info: MediaInfo): JSObject {
        val json = JSObject().put("name", info.name).put("sizeBytes", info.sizeBytes).put("width", info.width).put("height", info.height)
        info.durationMs?.let { json.put("durationMs", it) }
        return json
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
        // Seulement les anciennes images : le dossier media (vidéo et GIF choisis) n'est pas touché.
        dir.listFiles()?.filter { it.isFile && it != out }?.forEach { it.delete() }
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
