package io.karelisio.prisme.live

import kotlin.math.hypot

/** « Pause en économie de batterie » : le fond animé se fige (calcul pur, testé sur JVM). */
internal object EcoRules {
    /** Niveau de batterie, en %, à partir duquel le fond se fige s'il ne charge pas. */
    const val LOW_BATTERY_PERCENT = 15

    fun paused(enabled: Boolean, powerSave: Boolean, batteryPercent: Int?, charging: Boolean): Boolean =
        enabled && (powerSave || (!charging && batteryPercent != null && batteryPercent <= LOW_BATTERY_PERCENT))
}

/**
 * Double-tap sur l'écran d'accueil, à partir des touchers que le lanceur transmet au fond d'écran : deux
 * touchers rapprochés dans le temps ([maxDelayMs]) et l'espace ([maxDistancePx]).
 */
internal class DoubleTapDetector(private val maxDistancePx: Float, private val maxDelayMs: Long = MAX_DELAY_MS) {
    private var lastAt = NONE
    private var lastX = 0f
    private var lastY = 0f

    /** Un toucher à [atMs] (horloge monotone) ; vrai s'il complète un double-tap. */
    fun onTap(atMs: Long, x: Float, y: Float): Boolean {
        val double = lastAt != NONE && atMs - lastAt in 1..maxDelayMs && hypot(x - lastX, y - lastY) <= maxDistancePx
        // Un double-tap consomme ses deux touchers : un troisième en recommence un autre.
        lastAt = if (double) NONE else atMs
        lastX = x
        lastY = y
        return double
    }

    companion object {
        const val MAX_DELAY_MS = 400L
        private const val NONE = Long.MIN_VALUE
    }
}
