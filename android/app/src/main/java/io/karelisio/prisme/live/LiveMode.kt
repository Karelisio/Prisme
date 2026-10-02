package io.karelisio.prisme.live

/**
 * Genre de fond animé. Un seul service pour tous les genres dessinés au canevas : changer de genre ne redemande pas de
 * confirmation à Android. La vidéo fait exception : elle a son propre service ([LiveComponent.VIDEO]).
 */
enum class LiveMode(val key: String) {
    /** Photo avec parallaxe (et liste « à chaque déverrouillage », météo animée par-dessus). */
    IMAGE("image"),

    /** Une vidéo de la galerie, en boucle et sans le son (service à part). */
    VIDEO("video"),

    /** Un GIF (ou WebP) animé de la galerie, ajusté à l'écran. */
    GIF("gif"),

    /** Dégradés qui ondulent lentement, façon aurore boréale. */
    GRADIENT("gradient"),

    /** Particules qui réagissent au toucher et à l'inclinaison. */
    PARTICLES("particles"),

    /** Le sujet de la photo se détache du fond quand le téléphone bouge. */
    RELIEF("relief"),
    ;

    companion object {
        fun fromKey(key: String?): LiveMode = entries.firstOrNull { it.key == key } ?: IMAGE
    }
}
