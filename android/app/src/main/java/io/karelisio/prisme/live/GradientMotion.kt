package io.karelisio.prisme.live

import org.json.JSONObject
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sin

/**
 * Dégradé animé (calculs purs, testés sur JVM) : de grandes taches de couleur douces dérivent sur des
 * courbes de Lissajous aux fréquences sans rapport simple, si bien que le dessin ne se répète jamais à
 * l'identique.
 */
object GradientMotion {
    /**
     * Une tache : centre et amplitude du mouvement (fractions de l'écran), pulsations (rad/s) et phases,
     * rayon (fraction de la largeur), étirement vertical, opacité, et « respiration » (taille et angle).
     */
    class Blob(
        val cx: Float,
        val cy: Float,
        val ax: Float,
        val ay: Float,
        val wx: Float,
        val wy: Float,
        val px: Float,
        val py: Float,
        val radius: Float,
        val stretch: Float,
        val alpha: Float,
        val wr: Float,
        val pr: Float,
    )

    /** Taches étirées en hauteur, façon voiles d'aurore boréale. */
    val BLOBS: List<Blob> = listOf(
        Blob(0.25f, 0.20f, 0.30f, 0.12f, 0.110f, 0.073f, 0.0f, 1.7f, 0.62f, 2.1f, 0.85f, 0.051f, 0.3f),
        Blob(0.75f, 0.40f, 0.28f, 0.16f, 0.083f, 0.121f, 2.1f, 0.4f, 0.58f, 2.3f, 0.80f, 0.067f, 1.9f),
        Blob(0.35f, 0.66f, 0.32f, 0.14f, 0.097f, 0.059f, 4.0f, 2.9f, 0.66f, 2.0f, 0.75f, 0.043f, 4.1f),
        Blob(0.65f, 0.90f, 0.30f, 0.10f, 0.071f, 0.103f, 1.2f, 5.1f, 0.56f, 2.2f, 0.80f, 0.059f, 2.6f),
        Blob(0.50f, 0.50f, 0.40f, 0.32f, 0.061f, 0.089f, 3.3f, 3.8f, 0.40f, 1.6f, 0.60f, 0.077f, 5.3f),
    )

    /** Indices de [pose] : centre (fractions de l'écran), demi-axes (fractions de la largeur), angle (degrés). */
    const val X = 0
    const val Y = 1
    const val RX = 2
    const val RY = 3
    const val ANGLE = 4
    const val POSE_SIZE = 5

    /** Durée du fondu entre deux palettes. */
    const val FADE_MS = 1_400L

    /** Vitesse de l'animation et cadence qui lui suffit (le mouvement lent reste fluide à peu d'images). */
    enum class Speed(val key: String, val factor: Float, val fps: Int) {
        SLOW("slow", 0.6f, 20),
        MEDIUM("medium", 1.2f, 25),
        FAST("fast", 2.4f, 30),
        ;

        companion object {
            fun fromKey(key: String?): Speed = entries.firstOrNull { it.key == key } ?: SLOW
        }
    }

    /** Réglages de la scène (`scene_gradient`) : palette, vitesse, grain, couleur d'accent de l'app. */
    class Settings(val palette: String, val speed: Speed, val grain: Boolean, val accent: Int)

    fun settings(json: JSONObject): Settings = Settings(
        palette = MotionPalettes.normalize(json.optString("palette", MotionPalettes.DEFAULT)),
        speed = Speed.fromKey(json.optString("speed", Speed.SLOW.key)),
        grain = json.optBoolean("grain", true),
        accent = MotionPalettes.parseColor(json.optString("accent", "")) ?: MotionPalettes.APP_ACCENT,
    )

    /** Écrit dans [out] la pose de [blob] au temps d'animation [t] (secondes). */
    fun pose(blob: Blob, t: Double, out: FloatArray) {
        out[X] = blob.cx + blob.ax * sin(blob.wx * t + blob.px).toFloat()
        out[Y] = blob.cy + blob.ay * sin(blob.wy * t + blob.py).toFloat()
        val breath = 1f + 0.12f * sin(blob.wr * t + blob.pr).toFloat()
        out[RX] = blob.radius * breath
        out[RY] = out[RX] * blob.stretch
        out[ANGLE] = Math.toDegrees(0.35 * sin(blob.wr * 0.7 * t + blob.pr * 2.0)).toFloat()
    }

    /** Opacité d'une tache à la distance [s] du centre (0 au centre, 1 au bord) : cloche douce, nulle au bord. */
    fun profile(s: Float): Float {
        if (s >= 1f) return 0f
        val edge = exp(-PROFILE_K)
        return ((exp(-PROFILE_K * s * s) - edge) / (1f - edge)).coerceIn(0f, 1f)
    }

    /** Progression douce (0..1) du fondu entre palettes, [elapsedMs] après son début. */
    fun fade(elapsedMs: Long): Float {
        val t = (elapsedMs.toFloat() / FADE_MS).coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }

    /**
     * Palette affichée : celle choisie au double-tap ([cycled]) tant que la palette réglée dans l'app est
     * toujours celle d'où il est parti ([cycledFrom]) ; un nouveau choix dans l'app l'emporte.
     */
    fun shownPalette(setting: String, cycledFrom: String?, cycled: String?): String =
        if (cycled != null && cycledFrom == setting && cycled in MotionPalettes.KEYS) cycled else setting

    private const val PROFILE_K = 3f
}

/**
 * Horloge d'une animation : elle n'avance qu'avec les images affichées, s'arrête pendant les pauses et
 * reprend sans saut. Un écart trop long (image en retard) est borné à [maxStepNanos].
 */
class MotionClock(private val maxStepNanos: Long = 100_000_000L) {
    private var lastNanos = 0L

    /** Secondes depuis l'image précédente : 0 pour la première après [pause]. */
    fun tick(frameTimeNanos: Long): Float {
        val last = lastNanos
        lastNanos = frameTimeNanos
        if (last == 0L || frameTimeNanos <= last) return 0f
        return min(frameTimeNanos - last, maxStepNanos) / 1e9f
    }

    fun pause() {
        lastNanos = 0L
    }
}
