package io.karelisio.prisme.live

import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.roundToInt

/** Calculs de la parallaxe (purs, testés sur JVM). */
object ParallaxMath {
    /** Inclinaison donnant le décalage maximal (environ 20°). */
    const val MAX_TILT_RAD = 0.35f

    /** Vitesse à laquelle la position de repos suit la façon dont on tient le téléphone. */
    const val RECENTER_RATE = 0.015f

    /** Lissage de l'affichage (fraction parcourue vers la cible à chaque image). */
    const val SMOOTHING = 0.2f

    /** Marge de l'image autour de l'écran (fraction de la taille), selon l'intensité 0..1. */
    fun margin(intensity: Float): Float = 0.02f + 0.08f * intensity.coerceIn(0f, 1f)

    /** Inclinaisons gauche-droite et avant-arrière à partir du vecteur gravité. */
    fun tilt(gx: Float, gy: Float, gz: Float): Pair<Float, Float> {
        val sideways = atan2(gx, hypot(gy, gz))
        val forward = atan2(gz, gy)
        return sideways to forward
    }

    fun recenter(baseline: Float, angle: Float, rate: Float = RECENTER_RATE): Float = baseline + (angle - baseline) * rate

    /** Décalage normalisé (-1..1) de l'image par rapport à la position de repos. */
    fun normalized(angle: Float, baseline: Float): Float = ((angle - baseline) / MAX_TILT_RAD).coerceIn(-1f, 1f)

    fun smooth(current: Float, target: Float, factor: Float = SMOOTHING): Float = current + (target - current) * factor

    /** Taille de l'image préparée : l'écran plus la marge de chaque côté. */
    fun bitmapSize(width: Int, height: Int, margin: Float): Pair<Int, Int> =
        (width * (1 + 2 * margin)).roundToInt() to (height * (1 + 2 * margin)).roundToInt()

    /**
     * Position du coin de l'image : centrée au repos, elle glisse à l'opposé de l'inclinaison
     * pour donner l'impression d'être derrière l'écran.
     */
    fun drawOffset(normalized: Float, marginPx: Float): Float = -marginPx - normalized * marginPx
}
