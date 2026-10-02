package io.karelisio.prisme.live

import org.json.JSONObject
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Style de particules : nombre selon la densité, tailles et vitesses (dp, dp/s), part de la gravité
 * (positive : elles tombent ; négative : elles montent) et cadence quand personne ne les touche.
 */
enum class ParticleStyle(
    val key: String,
    val minCount: Int,
    val maxCount: Int,
    val minSizeDp: Float,
    val maxSizeDp: Float,
    val minSpeedDp: Float,
    val maxSpeedDp: Float,
    val idleFps: Int,
) {
    /** Points lumineux qui flânent et clignotent. */
    FIREFLIES("fireflies", 14, 56, 26f, 48f, 10f, 26f, 30),

    /** Bulles irisées qui montent en oscillant. */
    BUBBLES("bubbles", 10, 40, 14f, 52f, 26f, 70f, 30),

    /** Étoiles qui scintillent et glissent à peine. */
    STARS("stars", 50, 180, 5f, 13f, 1.5f, 4f, 20),

    /** Flocons qui tombent en se balançant. */
    SNOW("snow", 30, 140, 5f, 15f, 22f, 60f, 30),
    ;

    companion object {
        fun fromKey(key: String?): ParticleStyle = entries.firstOrNull { it.key == key } ?: FIREFLIES
    }
}

/** Fond derrière les particules. */
enum class ParticleBackground(val key: String) {
    /** L'image du genre « Photo », légèrement assombrie. */
    PHOTO("photo"),
    GRADIENT("gradient"),
    COLOR("color"),
    ;

    companion object {
        fun fromKey(key: String?): ParticleBackground = entries.firstOrNull { it.key == key } ?: GRADIENT
    }
}

/** Réglages de la scène (`scene_particles`). */
class ParticleSettings(
    val style: ParticleStyle,
    val density: Float,
    /** Le doigt attire les particules (sinon il les repousse). */
    val attract: Boolean,
    val background: ParticleBackground,
    val palette: String,
    val color: Int,
    val accent: Int,
)

/** Calculs des particules (purs, testés sur JVM). */
object ParticleRules {
    /** Particules au plus, et étincelles d'une gerbe : bornés pour garder une image légère. */
    const val MAX_PARTICLES = 240
    const val MAX_SPARKS = 36

    const val DEFAULT_DENSITY = 0.5f
    const val DEFAULT_COLOR = 0xFF0B1020.toInt()

    /** Écran de référence (dp²) pour lequel les nombres de [ParticleStyle] sont prévus. */
    private const val REFERENCE_AREA_DP = 392f * 873f

    fun settings(json: JSONObject): ParticleSettings {
        val density = json.optDouble("density", DEFAULT_DENSITY.toDouble()).toFloat()
        return ParticleSettings(
            style = ParticleStyle.fromKey(json.optString("style")),
            density = if (density.isNaN()) DEFAULT_DENSITY else density.coerceIn(0f, 1f),
            attract = json.optString("touch") == "attract",
            background = ParticleBackground.fromKey(json.optString("background")),
            palette = MotionPalettes.normalize(json.optString("palette", MotionPalettes.DEFAULT)),
            color = MotionPalettes.parseColor(json.optString("color")) ?: DEFAULT_COLOR,
            accent = MotionPalettes.parseColor(json.optString("accent")) ?: MotionPalettes.APP_ACCENT,
        )
    }

    /** Nombre de particules pour une densité (0..1) et un écran de [widthDp] × [heightDp]. */
    fun count(style: ParticleStyle, density: Float, widthDp: Float, heightDp: Float): Int {
        val base = style.minCount + (style.maxCount - style.minCount) * density.coerceIn(0f, 1f)
        val area = (widthDp * heightDp / REFERENCE_AREA_DP).coerceIn(0.5f, 1.5f)
        return (base * area).roundToInt().coerceIn(1, MAX_PARTICLES)
    }

    /** Éclat d'une luciole (0..1) à la position [cycle] (0..1) de son cycle : allumée un peu moins de la moitié du temps. */
    fun fireflyGlow(cycle: Float): Float {
        val c = cycle.mod(1f)
        if (c >= FIREFLY_ON) return 0f
        val on = sin(c / FIREFLY_ON * PI.toFloat())
        return on * on
    }

    /** Scintillement d'une étoile (0.1..1), produit de deux oscillations de phases [a] et [b]. */
    fun twinkle(a: Float, b: Float): Float = (0.55f + 0.45f * sin(a) * sin(b)).coerceIn(0.1f, 1f)

    private const val FIREFLY_ON = 0.45f
}

/** Doigt posé sur l'écran : position et vitesse (px, px/s). */
class ParticleTouch {
    var active = false
    var x = 0f
    var y = 0f
    var vx = 0f
    var vy = 0f
}

/**
 * Particules et leur physique, sans allocation par image : dérive propre au style, gravité selon
 * l'inclinaison, doigt qui repousse ou attire, vitesses bornées et amorties vers le mouvement naturel.
 * Les étincelles d'une gerbe (double-tap) occupent les dernières places des tableaux.
 */
class ParticleField(private val random: Random = Random.Default) {
    val capacity = ParticleRules.MAX_PARTICLES + ParticleRules.MAX_SPARKS
    val x = FloatArray(capacity)
    val y = FloatArray(capacity)
    val vx = FloatArray(capacity)
    val vy = FloatArray(capacity)

    /** Taille du sprite (px). */
    val size = FloatArray(capacity)

    /** Profondeur 0 (loin : petite, lente, pâle) à 1 (près). */
    val depth = FloatArray(capacity)

    /** Phases qui avancent avec le temps (clignotement, balancement, scintillement). */
    val phase = FloatArray(capacity)
    val phase2 = FloatArray(capacity)
    private val freq = FloatArray(capacity)
    private val speed = FloatArray(capacity)
    private val heading = FloatArray(capacity)

    /** Vie restante (s) d'une étincelle ; 0 : éteinte. */
    val life = FloatArray(capacity)

    var style = ParticleStyle.FIREFLIES
        private set
    var count = 0
        private set
    var width = 0f
        private set
    var height = 0f
        private set
    private var density = 1f
    private var dirX = 0f
    private var dirY = 1f

    /** Agitation (dp/s) : plus grand écart d'une particule à son mouvement naturel (toucher, gerbe, inclinaison). */
    var agitation = 0f
        private set
    var sparksAlive = 0
        private set

    /** Encore en mouvement forcé (toucher, gerbe) : la scène garde alors la cadence maximale. */
    val excited: Boolean get() = sparksAlive > 0 || agitation > EXCITED_DP

    /** Répartit [count] particules du [style] sur un écran de [width] × [height] px ([density] px par dp). */
    fun reset(style: ParticleStyle, count: Int, width: Float, height: Float, density: Float) {
        this.style = style
        this.count = count.coerceIn(0, ParticleRules.MAX_PARTICLES)
        this.width = width
        this.height = height
        this.density = density
        for (i in 0 until this.count) spawn(i, random.nextFloat() * width, random.nextFloat() * height)
        for (i in ParticleRules.MAX_PARTICLES until capacity) life[i] = 0f
        sparksAlive = 0
        agitation = 0f
        updateDirection(0f, 1f)
        // Départ au mouvement naturel : pas d'élan au premier affichage.
        for (i in 0 until this.count) {
            naturalVelocity(i, 0f)
            vx[i] = targetX
            vy[i] = targetY
        }
    }

    private fun spawn(i: Int, px: Float, py: Float) {
        val d = random.nextFloat()
        depth[i] = d
        // Neige : beaucoup de petits flocons lointains, quelques gros proches.
        val sizeT = if (style == ParticleStyle.SNOW) d * d else d
        size[i] = lerp(style.minSizeDp, style.maxSizeDp, sizeT) * density
        speed[i] = lerp(style.minSpeedDp, style.maxSpeedDp, d) * density
        freq[i] = lerp(0.15f, 0.4f, random.nextFloat())
        phase[i] = random.nextFloat() * TWO_PI
        phase2[i] = random.nextFloat() * TWO_PI
        heading[i] = random.nextFloat() * TWO_PI
        x[i] = px
        y[i] = py
    }

    /**
     * Avance de [dt] secondes. Gravité dans le repère de l'écran ([gx], [gy], en g) : téléphone posé à
     * plat, les particules gardent une chute douce vers le bas.
     */
    fun step(dt: Float, gx: Float, gy: Float, touch: ParticleTouch, attract: Boolean) {
        if (dt <= 0f) return
        updateDirection(gx, gy)
        val relax = 1f - exp(-RELAX * dt)
        val radius = TOUCH_RADIUS_DP * density
        val maxSpeed = MAX_SPEED_DP * density
        var worst = 0f
        for (i in 0 until count) {
            naturalVelocity(i, dt, gx)
            var u = vx[i] + (targetX - vx[i]) * relax
            var v = vy[i] + (targetY - vy[i]) * relax
            if (touch.active) {
                val dx = x[i] - touch.x
                val dy = y[i] - touch.y
                val d2 = dx * dx + dy * dy
                if (d2 < radius * radius) {
                    val d = sqrt(d2).coerceAtLeast(1f)
                    val falloff = (1f - d / radius) * (1f - d / radius)
                    val push = TOUCH_ACCEL_DP * density * falloff * dt
                    if (attract) {
                        // Attirées sans s'écraser sur le doigt : la force s'efface tout près.
                        val near = min(1f, d / (0.25f * radius))
                        u -= dx / d * push * near
                        v -= dy / d * push * near
                    } else {
                        u += dx / d * push
                        v += dy / d * push
                    }
                    // Le doigt entraîne aussi les particules dans son mouvement.
                    val stir = min(1f, STIR_RATE * falloff * dt)
                    u += (touch.vx - u) * stir
                    v += (touch.vy - v) * stir
                }
            }
            val s2 = u * u + v * v
            if (s2 > maxSpeed * maxSpeed) {
                val k = maxSpeed / sqrt(s2)
                u *= k
                v *= k
            }
            vx[i] = u
            vy[i] = v
            x[i] += u * dt
            y[i] += v * dt
            wrap(i)
            val ex = u - targetX
            val ey = v - targetY
            worst = max(worst, ex * ex + ey * ey)
        }
        agitation = sqrt(worst) / density
        stepSparks(dt)
    }

    // Vitesse naturelle de la particule calculée par [naturalVelocity] (évite d'allouer une paire).
    private var targetX = 0f
    private var targetY = 0f

    private fun naturalVelocity(i: Int, dt: Float, gx: Float = 0f) {
        val s = speed[i]
        when (style) {
            ParticleStyle.FIREFLIES -> {
                phase[i] = (phase[i] + freq[i] * dt).mod(1f)
                phase2[i] = (phase2[i] + freq[i] * 3f * dt).mod(TWO_PI)
                heading[i] += sin(phase2[i]) * 1.6f * dt
                targetX = cos(heading[i]) * s + gx * 0.6f * s
                targetY = sin(heading[i]) * s
            }
            ParticleStyle.BUBBLES -> {
                phase[i] = (phase[i] + freq[i] * 5.2f * dt).mod(TWO_PI)
                val wobble = sin(phase[i]) * 10f * density
                targetX = -dirX * s + wobble * dirY
                targetY = -dirY * s - wobble * dirX
            }
            ParticleStyle.STARS -> {
                phase[i] = (phase[i] + freq[i] * 9f * dt).mod(TWO_PI)
                phase2[i] = (phase2[i] + freq[i] * 5.3f * dt).mod(TWO_PI)
                targetX = (0.5f + 2f * gx) * s
                targetY = 0.2f * s
            }
            ParticleStyle.SNOW -> {
                phase[i] = (phase[i] + freq[i] * 4f * dt).mod(TWO_PI)
                val sway = sin(phase[i]) * 14f * density * (0.5f + depth[i])
                targetX = dirX * s + sway * dirY
                targetY = dirY * s - sway * dirX
            }
        }
    }

    private fun updateDirection(gx: Float, gy: Float) {
        val magnitude = hypot(gx, gy)
        val ex = gx
        val ey = gy + max(0f, FLAT_BIAS - magnitude)
        val m = hypot(ex, ey).coerceAtLeast(1e-3f)
        dirX = ex / m
        dirY = ey / m
    }

    /** Sortie de l'écran : retour de l'autre côté (neige et bulles reviennent à une place au hasard). */
    private fun wrap(i: Int) {
        val m = size[i]
        val reseed = style == ParticleStyle.SNOW || style == ParticleStyle.BUBBLES
        if (y[i] > height + m) {
            y[i] -= height + 2 * m
            if (reseed) x[i] = random.nextFloat() * width
        } else if (y[i] < -m) {
            y[i] += height + 2 * m
            if (reseed) x[i] = random.nextFloat() * width
        }
        if (x[i] > width + m) {
            x[i] -= width + 2 * m
        } else if (x[i] < -m) {
            x[i] += width + 2 * m
        }
    }

    /** Gerbe au point ([cx], [cy]) : des étincelles jaillissent et les particules proches s'écartent. */
    fun burst(cx: Float, cy: Float) {
        for (k in 0 until ParticleRules.MAX_SPARKS) {
            val i = ParticleRules.MAX_PARTICLES + k
            val angle = random.nextFloat() * TWO_PI
            val s = lerp(SPARK_MIN_SPEED_DP, SPARK_MAX_SPEED_DP, random.nextFloat()) * density
            x[i] = cx
            y[i] = cy
            vx[i] = cos(angle) * s
            vy[i] = sin(angle) * s
            depth[i] = random.nextFloat()
            size[i] = lerp(style.minSizeDp, style.maxSizeDp, 0.35f + 0.4f * random.nextFloat()) * density * SPARK_SCALE
            phase[i] = random.nextFloat()
            phase2[i] = random.nextFloat() * TWO_PI
            life[i] = SPARK_LIFE * lerp(0.6f, 1f, random.nextFloat())
        }
        sparksAlive = ParticleRules.MAX_SPARKS
        val radius = 0.5f * min(width, height)
        for (i in 0 until count) {
            val dx = x[i] - cx
            val dy = y[i] - cy
            val d = hypot(dx, dy).coerceAtLeast(1f)
            if (d < radius) {
                val kick = SHOCK_DP * density * (1f - d / radius)
                vx[i] += dx / d * kick
                vy[i] += dy / d * kick
            }
        }
    }

    private fun stepSparks(dt: Float) {
        if (sparksAlive == 0) return
        val drag = exp(-SPARK_DRAG * dt)
        var alive = 0
        for (i in ParticleRules.MAX_PARTICLES until capacity) {
            if (life[i] <= 0f) continue
            life[i] = max(0f, life[i] - dt)
            vx[i] *= drag
            vy[i] *= drag
            x[i] += vx[i] * dt
            y[i] += vy[i] * dt
            phase2[i] = (phase2[i] + 8f * dt).mod(TWO_PI)
            if (life[i] > 0f) alive++
        }
        sparksAlive = alive
    }

    /** Opacité d'une étincelle selon sa vie restante. */
    fun sparkAlpha(i: Int): Float {
        val t = (life[i] / SPARK_LIFE).coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }

    companion object {
        const val TWO_PI = (2 * PI).toFloat()

        /** Retour au mouvement naturel (par seconde). */
        const val RELAX = 2.2f

        /** Zone d'influence du doigt, poussée maximale, et entraînement par son mouvement. */
        const val TOUCH_RADIUS_DP = 120f
        const val TOUCH_ACCEL_DP = 2600f
        const val STIR_RATE = 6f
        const val MAX_SPEED_DP = 600f

        /** Au-delà de cet écart au mouvement naturel (dp/s), la scène reste à pleine cadence. */
        const val EXCITED_DP = 40f

        /** À plat, la gravité dans l'écran disparaît : un reste de chute vers le bas garde la scène vivante. */
        const val FLAT_BIAS = 0.6f

        const val SPARK_LIFE = 1.4f
        const val SPARK_DRAG = 2.4f
        const val SPARK_SCALE = 0.6f
        const val SPARK_MIN_SPEED_DP = 120f
        const val SPARK_MAX_SPEED_DP = 330f
        const val SHOCK_DP = 260f

        private fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t
    }
}
