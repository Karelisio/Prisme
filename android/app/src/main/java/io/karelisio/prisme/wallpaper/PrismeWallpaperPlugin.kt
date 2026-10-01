package io.karelisio.prisme.wallpaper

import android.app.Activity
import android.app.WallpaperManager
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.activity.result.ActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Pont Capacitor : chaque méthode valide ses paramètres, délègue le travail lourd hors du thread
 * principal et renvoie des erreurs avec un code stable (voir WallpaperException).
 */
@CapacitorPlugin(name = "PrismeWallpaper")
class PrismeWallpaperPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val io = Dispatchers.IO.limitedParallelism(4)
    private val mainHandler = Handler(Looper.getMainLooper())
    private lateinit var store: ImageStore
    private lateinit var importer: ImageImporter
    private lateinit var applier: WallpaperApplier
    private lateinit var applied: AppliedWallpapers
    private var colorsListener: WallpaperManager.OnColorsChangedListener? = null

    override fun load() {
        store = ImageStore(context)
        importer = ImageImporter(context.contentResolver, store)
        applier = WallpaperApplier(context)
        applied = AppliedWallpapers(context)
        if (Build.VERSION.SDK_INT >= 27) {
            // Les couleurs Material You sont recalculées un peu après le changement de fond.
            val listener = WallpaperManager.OnColorsChangedListener { _, _ ->
                emitSystemTheme()
                mainHandler.postDelayed({ emitSystemTheme() }, THEME_REFRESH_DELAY_MS)
            }
            WallpaperManager.getInstance(context).addOnColorsChangedListener(listener, mainHandler)
            colorsListener = listener
        }
    }

    override fun handleOnConfigurationChanged(newConfig: Configuration) {
        super.handleOnConfigurationChanged(newConfig)
        emitSystemTheme()
    }

    override fun handleOnResume() {
        super.handleOnResume()
        emitSystemTheme()
    }

    override fun handleOnDestroy() {
        if (Build.VERSION.SDK_INT >= 27) {
            colorsListener?.let { WallpaperManager.getInstance(context).removeOnColorsChangedListener(it) }
        }
        mainHandler.removeCallbacksAndMessages(null)
        scope.cancel()
        super.handleOnDestroy()
    }

    private fun emitSystemTheme() {
        if (hasListeners(EVENT_THEME)) notifyListeners(EVENT_THEME, SystemTheme.read(context))
    }

    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        val manager = WallpaperManager.getInstance(context)
        call.resolve(
            JSObject()
                .put("supported", manager.isWallpaperSupported)
                .put("settable", manager.isSetWallpaperAllowed)
                .put("lockScreen", true)
                .put("liveWallpaper", context.packageManager.hasSystemFeature(PackageManager.FEATURE_LIVE_WALLPAPER))
                .put("dynamicColor", Build.VERSION.SDK_INT >= 31)
                .put("sdkInt", Build.VERSION.SDK_INT)
                .put("manufacturer", Build.MANUFACTURER)
                .put("model", Build.MODEL),
        )
    }

    @PluginMethod
    fun getScreenInfo(call: PluginCall) {
        val screen = ScreenInfo.read(context, activity)
        call.resolve(
            JSObject()
                .put("width", screen.width)
                .put("height", screen.height)
                .put("density", screen.density.toDouble()),
        )
    }

    @PluginMethod
    fun getSystemTheme(call: PluginCall) {
        call.resolve(SystemTheme.read(context))
    }

    @PluginMethod
    fun setWallpaper(call: PluginCall) {
        val uri = call.getString("uri")
        val target = WallpaperTarget.fromKey(call.getString("target", "both"))
        if (uri.isNullOrBlank() || target == null) {
            call.reject("Paramètres invalides", "INVALID_ARGUMENT")
            return
        }
        val crop = WallpaperRef.cropFromJson(call.getObject("crop"))
        val id = call.getString("id") ?: uri
        val screen = ScreenInfo.read(context, activity)
        scope.launch {
            try {
                val file = withContext(io) { store.resolve(uri) { progress -> emitProgress(id, progress) } }
                withContext(Dispatchers.Default) { applier.apply(file, target, crop, screen) }
                applied.recordManual(target, WallpaperRef(id, uri, crop))
                call.resolve(
                    JSObject().put("target", target.key).put("width", screen.width).put("height", screen.height),
                )
            } catch (e: Throwable) {
                rejectWith(call, e)
            }
        }
    }

    @PluginMethod
    fun cacheImage(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("URL manquante", "INVALID_ARGUMENT")
            return
        }
        val persistent = call.getBoolean("persistent", false) == true
        scope.launch {
            try {
                val file = withContext(io) { store.fetch(url, persistent) }
                call.resolve(JSObject().put("path", file.absolutePath))
            } catch (e: Throwable) {
                rejectWith(call, e)
            }
        }
    }

    @PluginMethod
    fun removeOfflineImage(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("URL manquante", "INVALID_ARGUMENT")
            return
        }
        scope.launch {
            val removed = withContext(io) { store.removeOffline(url) }
            call.resolve(JSObject().put("removed", removed))
        }
    }

    @PluginMethod
    fun saveImage(call: PluginCall) {
        val data = call.getString("data")
        if (data.isNullOrBlank()) {
            call.reject("Image manquante", "INVALID_ARGUMENT")
            return
        }
        val name = call.getString("name")
        scope.launch {
            try {
                val image = withContext(io) { importer.saveBase64(data, name) }
                call.resolve(localImageResult(image))
            } catch (e: Throwable) {
                rejectWith(call, e)
            }
        }
    }

    @PluginMethod
    fun deleteLocalImage(call: PluginCall) {
        val path = call.getString("path")
        val file = path?.let(::File)
        val allowed = file != null && listOf(store.importsRoot, store.creationsRoot).any { root ->
            file.canonicalPath.startsWith(root.canonicalPath + File.separator)
        }
        if (!allowed) {
            call.reject("Chemin non autorisé", "INVALID_ARGUMENT")
            return
        }
        scope.launch {
            val deleted = withContext(io) { file.delete() }
            call.resolve(JSObject().put("deleted", deleted))
        }
    }

    @PluginMethod
    fun pickImage(call: PluginCall) {
        val request = PickVisualMediaRequest.Builder()
            .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly)
            .build()
        val intent = ActivityResultContracts.PickVisualMedia().createIntent(context, request)
        startActivityForResult(call, intent, "onImagePicked")
    }

    @ActivityCallback
    private fun onImagePicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("cancelled", true))
            return
        }
        scope.launch {
            try {
                val image = withContext(io) { importer.importFromGallery(uri) }
                call.resolve(localImageResult(image).put("cancelled", false))
            } catch (e: Throwable) {
                rejectWith(call, e)
            }
        }
    }

    @PluginMethod
    fun getCacheInfo(call: PluginCall) {
        scope.launch {
            val (cache, offline) = withContext(io) { store.sizes() }
            call.resolve(JSObject().put("cacheBytes", cache).put("offlineBytes", offline))
        }
    }

    @PluginMethod
    fun clearCache(call: PluginCall) {
        val includeOffline = call.getBoolean("includeOffline", false) == true
        scope.launch {
            withContext(io) { store.clear(includeOffline) }
            call.resolve()
        }
    }

    private fun emitProgress(id: String, progress: Float) {
        val data = JSObject().put("id", id).put("progress", progress.toDouble())
        mainHandler.post { notifyListeners(EVENT_PROGRESS, data) }
    }

    private fun localImageResult(image: LocalImage): JSObject = JSObject()
        .put("path", image.file.absolutePath)
        .put("width", image.width)
        .put("height", image.height)

    private fun rejectWith(call: PluginCall, error: Throwable) {
        when (error) {
            is WallpaperException -> call.reject(error.message, error.code, error)
            is OutOfMemoryError -> call.reject("Mémoire insuffisante", "OUT_OF_MEMORY")
            is Exception -> call.reject(error.message ?: "Erreur inattendue", "UNKNOWN", error)
            else -> throw error
        }
    }

    private companion object {
        const val EVENT_THEME = "systemThemeChanged"
        const val EVENT_PROGRESS = "applyProgress"
        const val THEME_REFRESH_DELAY_MS = 2_000L
    }
}
