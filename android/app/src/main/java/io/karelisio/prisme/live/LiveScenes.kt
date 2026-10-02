package io.karelisio.prisme.live

import android.content.Context

/** Scène et couche par-dessus de chaque genre de fond animé. */
internal object LiveScenes {
    fun create(context: Context, mode: LiveMode): LiveScene = when (mode) {
        LiveMode.IMAGE -> ImageScene(context)
        // Genres pas encore disponibles : la photo avec parallaxe.
        LiveMode.VIDEO -> ImageScene(context) // service à part (VideoWallpaperService) : ce moteur ne lit jamais de vidéo
        LiveMode.GIF -> GifScene(context)
        LiveMode.GRADIENT -> ImageScene(context)
        LiveMode.PARTICLES -> ImageScene(context)
        LiveMode.RELIEF -> ImageScene(context)
    }

    /** Couche dessinée par-dessus la scène du genre [mode] (météo animée), ou null. */
    fun overlay(context: Context, mode: LiveMode): SceneOverlay? = null
}
