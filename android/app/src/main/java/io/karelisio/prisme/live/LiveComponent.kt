package io.karelisio.prisme.live

/**
 * Les deux fonds animés Prisme déclarés dans Android : [SCENES] (photo, GIF, dégradés… dessinés au canevas) et
 * [VIDEO] (lue par MediaPlayer). Une surface qui a servi au canevas ne peut plus recevoir de vidéo, et inversement :
 * la vidéo a donc son propre service.
 */
enum class LiveComponent(val key: String) {
    SCENES("scenes"),
    VIDEO("video"),
    ;

    companion object {
        /** Fond qui affiche le genre [mode] : tous passent par les scènes, sauf la vidéo. */
        fun forMode(mode: LiveMode): LiveComponent = if (mode == LiveMode.VIDEO) VIDEO else SCENES

        /** Fond Prisme correspondant à un service (nom de classe), ou null pour tout autre fond d'écran. */
        fun ofService(className: String?): LiveComponent? = when (className) {
            ParallaxWallpaperService::class.java.name -> SCENES
            VideoWallpaperService::class.java.name -> VIDEO
            else -> null
        }
    }
}
