package io.karelisio.prisme.live

import android.content.Context

/** Scène et couche par-dessus de chaque genre de fond animé. */
internal object LiveScenes {
    fun create(context: Context, mode: LiveMode): LiveScene = when (mode) {
        LiveMode.IMAGE -> ImageScene(context)
        // Genres pas encore disponibles : la photo avec parallaxe.
        LiveMode.VIDEO -> ImageScene(context)
        LiveMode.GIF -> ImageScene(context)
        LiveMode.GRADIENT -> GradientScene(context)
        LiveMode.PARTICLES -> ParticlesScene(context)
        LiveMode.RELIEF -> ImageScene(context)
    }

    /** Couche dessinée par-dessus la scène du genre [mode] (météo animée), ou null. */
    fun overlay(context: Context, mode: LiveMode): SceneOverlay? = when (mode) {
        // Réglée avec la photo (`scene_image`) : elle ne dessine rien tant qu'elle est désactivée.
        LiveMode.IMAGE -> WeatherOverlay(context)
        else -> null
    }
}
