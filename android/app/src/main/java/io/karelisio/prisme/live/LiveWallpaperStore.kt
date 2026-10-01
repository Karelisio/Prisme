package io.karelisio.prisme.live

import android.app.WallpaperManager
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences

/** Image et intensité du fond animé, partagées entre l'app et le service. */
object LiveWallpaperStore {
    const val DEFAULT_INTENSITY = 0.5f
    private const val PREFS = "prisme_live"
    private const val KEY_PATH = "path"
    private const val KEY_INTENSITY = "intensity"

    data class Config(val path: String?, val intensity: Float)

    fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun read(context: Context): Config {
        val prefs = prefs(context)
        return Config(prefs.getString(KEY_PATH, null), prefs.getFloat(KEY_INTENSITY, DEFAULT_INTENSITY))
    }

    fun write(context: Context, path: String, intensity: Float) {
        prefs(context).edit().putString(KEY_PATH, path).putFloat(KEY_INTENSITY, intensity.coerceIn(0f, 1f)).apply()
    }

    fun component(context: Context) = ComponentName(context, ParallaxWallpaperService::class.java)

    fun isActive(context: Context): Boolean =
        WallpaperManager.getInstance(context).wallpaperInfo?.component == component(context)
}
