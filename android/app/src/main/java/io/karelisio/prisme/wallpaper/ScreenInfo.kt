package io.karelisio.prisme.wallpaper

import android.app.Activity
import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Build
import android.util.DisplayMetrics
import android.view.Display
import kotlin.math.max
import kotlin.math.min

/** Taille physique de l'écran en pixels, toujours exprimée en portrait. */
internal object ScreenInfo {
    data class Size(val width: Int, val height: Int, val density: Float)

    /** [activity] est facultative : sans elle (tâche de fond), on passe par DisplayManager. */
    fun read(context: Context, activity: Activity?): Size {
        val (w, h) = if (activity != null && Build.VERSION.SDK_INT >= 30) {
            val bounds = activity.windowManager.maximumWindowMetrics.bounds
            bounds.width() to bounds.height()
        } else {
            val display = context.getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)
            val metrics = DisplayMetrics()
            @Suppress("DEPRECATION")
            display.getRealMetrics(metrics)
            metrics.widthPixels to metrics.heightPixels
        }
        return Size(min(w, h), max(w, h), context.resources.displayMetrics.density)
    }
}
