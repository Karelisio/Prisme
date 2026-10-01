package io.karelisio.prisme.wallpaper

import android.app.WallpaperManager

/** Écran(s) visé(s) par un changement de fond d'écran. */
enum class WallpaperTarget(val key: String, val flags: Int) {
    HOME("home", WallpaperManager.FLAG_SYSTEM),
    LOCK("lock", WallpaperManager.FLAG_LOCK),
    BOTH("both", WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK);

    companion object {
        fun fromKey(key: String?): WallpaperTarget? = entries.firstOrNull { it.key == key }
    }
}

/** Erreur remontée telle quelle au JavaScript (code stable + message lisible). */
class WallpaperException(val code: String, message: String, cause: Throwable? = null) : Exception(message, cause)
