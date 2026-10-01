package io.karelisio.prisme.live

import android.app.WallpaperManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import io.karelisio.prisme.wallpaper.BitmapLoader
import io.karelisio.prisme.wallpaper.CropMath
import io.karelisio.prisme.wallpaper.ImageStore
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
import java.io.FileOutputStream

/** Prépare l'image du fond animé puis ouvre l'écran système de confirmation si besoin. */
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
                .put("configured", config.path != null),
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

    /** Recadre l'image à la taille de l'écran plus la marge de parallaxe, dans un nouveau fichier. */
    private fun prepare(uri: String, intensity: Float, crop: io.karelisio.prisme.wallpaper.NormalizedRect?, screen: ScreenInfo.Size): String {
        val source = ImageStore(context).resolve(uri)
        val margin = ParallaxMath.margin(intensity)
        val (width, height) = ParallaxMath.bitmapSize(screen.width, screen.height, margin)
        val bounds = BitmapLoader.readBounds(source)
        val region = CropMath.resolveCrop(bounds.width, bounds.height, crop, width, height)
        val bitmap = BitmapLoader.decodeRegion(source, region, width, height)
        val dir = File(context.filesDir, "live").apply { mkdirs() }
        // Nom unique : le service détecte le changement et recharge l'image.
        val out = File(dir, "live-${System.currentTimeMillis()}.jpg")
        try {
            FileOutputStream(out).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
        } finally {
            bitmap.recycle()
        }
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
