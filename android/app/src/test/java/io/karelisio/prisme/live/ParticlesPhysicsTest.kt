package io.karelisio.prisme.live

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.hypot
import kotlin.math.sqrt
import kotlin.random.Random

class ParticlesPhysicsTest {
    private val width = 1080f
    private val height = 2400f
    private val density = 2.75f
    private val frame = 1f / 30f

    // Sans `apply` : à l'intérieur, `width` et `height` seraient ceux du champ (encore à 0).
    private fun field(style: ParticleStyle, count: Int = 80, seed: Int = 1): ParticleField {
        val f = ParticleField(Random(seed))
        f.reset(style, count, width, height, density)
        return f
    }

    private fun meanVx(f: ParticleField) = (0 until f.count).map { f.vx[it] }.average()
    private fun meanVy(f: ParticleField) = (0 until f.count).map { f.vy[it] }.average()

    @Test
    fun `nombre de particules selon la densité et l'écran, borné`() {
        assertEquals(14, ParticleRules.count(ParticleStyle.FIREFLIES, 0f, 392f, 873f))
        assertEquals(35, ParticleRules.count(ParticleStyle.FIREFLIES, 0.5f, 392f, 873f))
        assertEquals(56, ParticleRules.count(ParticleStyle.FIREFLIES, 1f, 392f, 873f))
        assertEquals(56, ParticleRules.count(ParticleStyle.FIREFLIES, 7f, 392f, 873f))
        // Grande tablette : plus de particules, jamais au-delà du maximum.
        assertTrue(ParticleRules.count(ParticleStyle.SNOW, 0.5f, 800f, 1280f) > ParticleRules.count(ParticleStyle.SNOW, 0.5f, 392f, 873f))
        assertEquals(ParticleRules.MAX_PARTICLES, ParticleRules.count(ParticleStyle.STARS, 1f, 900f, 1400f))
    }

    @Test
    fun `réglages lus du JSON, valeurs par défaut sinon`() {
        val defaults = ParticleRules.settings(JSONObject())
        assertEquals(ParticleStyle.FIREFLIES, defaults.style)
        assertEquals(ParticleRules.DEFAULT_DENSITY, defaults.density, 0f)
        assertFalse(defaults.attract)
        assertEquals(ParticleBackground.GRADIENT, defaults.background)
        assertEquals("aurora", defaults.palette)
        assertEquals(ParticleRules.DEFAULT_COLOR, defaults.color)
        val custom = ParticleRules.settings(
            JSONObject("""{"style":"bubbles","density":1.7,"touch":"attract","background":"color","palette":"ocean","color":"#102030"}"""),
        )
        assertEquals(ParticleStyle.BUBBLES, custom.style)
        assertEquals(1f, custom.density, 0f)
        assertTrue(custom.attract)
        assertEquals(ParticleBackground.COLOR, custom.background)
        assertEquals("ocean", custom.palette)
        assertEquals(0xFF102030.toInt(), custom.color)
    }

    @Test
    fun `la neige tombe dans le sens de la gravité, même téléphone à plat`() {
        val snow = field(ParticleStyle.SNOW)
        val touch = ParticleTouch()
        repeat(60) { snow.step(frame, 0f, 1f, touch, attract = false) }
        assertTrue(meanVy(snow) > 20 * density)
        assertEquals(0.0, meanVx(snow), 8.0 * density)
        // Penché à gauche : elle part à gauche.
        repeat(90) { snow.step(frame, -0.7f, 0.7f, touch, attract = false) }
        assertTrue(meanVx(snow) < -10 * density)
        // Posé à plat : chute douce, toujours vers le bas.
        repeat(90) { snow.step(frame, 0f, 0f, touch, attract = false) }
        assertTrue(meanVy(snow) > 10 * density)
    }

    @Test
    fun `les bulles montent à l'opposé de la gravité`() {
        val bubbles = field(ParticleStyle.BUBBLES)
        repeat(60) { bubbles.step(frame, 0f, 1f, ParticleTouch(), attract = false) }
        assertTrue(meanVy(bubbles) < -20 * density)
    }

    @Test
    fun `le doigt repousse ou attire, avec des vitesses bornées`() {
        val touch = ParticleTouch().apply {
            active = true
            x = width / 2
            y = height / 2
        }
        val radius = ParticleField.TOUCH_RADIUS_DP * density
        for (attract in listOf(false, true)) {
            val f = field(ParticleStyle.FIREFLIES, count = 200, seed = 3)
            val near = (0 until f.count).filter { hypot(f.x[it] - touch.x, f.y[it] - touch.y) in 0.4f * radius..0.9f * radius }
            assertTrue(near.size >= 3)
            val before = near.map { hypot(f.x[it] - touch.x, f.y[it] - touch.y) }.average()
            repeat(12) { f.step(1f / 60f, 0f, 1f, touch, attract) }
            val after = near.map { hypot(f.x[it] - touch.x, f.y[it] - touch.y) }.average()
            if (attract) assertTrue(after < before) else assertTrue(after > before)
            val maxSpeed = ParticleField.MAX_SPEED_DP * density * 1.001f
            for (i in 0 until f.count) assertTrue(sqrt(f.vx[i] * f.vx[i] + f.vy[i] * f.vy[i]) <= maxSpeed)
            assertTrue(f.excited)
        }
    }

    @Test
    fun `après un toucher, retour au calme`() {
        val f = field(ParticleStyle.STARS, count = 150)
        val touch = ParticleTouch().apply {
            active = true
            x = width / 2
            y = height / 2
            vx = 3000f
        }
        assertFalse(f.excited)
        repeat(20) { f.step(1f / 60f, 0f, 1f, touch, attract = false) }
        assertTrue(f.excited)
        touch.active = false
        repeat(90) { f.step(frame, 0f, 1f, touch, attract = false) }
        assertFalse(f.excited)
    }

    @Test
    fun `gerbe, des étincelles qui s'éteignent d'elles-mêmes`() {
        val f = field(ParticleStyle.FIREFLIES)
        f.burst(width / 2, height / 2)
        assertEquals(ParticleRules.MAX_SPARKS, f.sparksAlive)
        assertTrue(f.excited)
        val spark = ParticleRules.MAX_PARTICLES
        assertTrue(f.sparkAlpha(spark) > 0.3f)
        repeat(60) { f.step(frame, 0f, 1f, ParticleTouch(), attract = false) }
        assertEquals(0, f.sparksAlive)
        assertEquals(0f, f.sparkAlpha(spark), 0f)
        repeat(90) { f.step(frame, 0f, 1f, ParticleTouch(), attract = false) }
        assertFalse(f.excited)
    }

    @Test
    fun `les particules restent autour de l'écran, quoi qu'il arrive`() {
        val random = Random(9)
        for (style in ParticleStyle.entries) {
            val f = field(style, count = ParticleRules.MAX_PARTICLES)
            val touch = ParticleTouch()
            repeat(3_000) {
                touch.active = random.nextFloat() < 0.3f
                touch.x = random.nextFloat() * width
                touch.y = random.nextFloat() * height
                touch.vx = (random.nextFloat() - 0.5f) * 5000f
                touch.vy = (random.nextFloat() - 0.5f) * 5000f
                if (it % 500 == 0) f.burst(width / 2, height / 2)
                f.step(random.nextFloat() * 0.1f, random.nextFloat() * 2 - 1, random.nextFloat() * 2 - 1, touch, random.nextBoolean())
            }
            for (i in 0 until f.count) {
                assertTrue(style.name, f.x[i] in -200f..width + 200f)
                assertTrue(style.name, f.y[i] in -200f..height + 200f)
                assertFalse(f.vx[i].isNaN() || f.vy[i].isNaN())
            }
        }
    }

    @Test
    fun `même graine, même mouvement`() {
        val a = field(ParticleStyle.SNOW, seed = 42)
        val b = field(ParticleStyle.SNOW, seed = 42)
        repeat(100) {
            a.step(frame, 0.2f, 0.9f, ParticleTouch(), attract = false)
            b.step(frame, 0.2f, 0.9f, ParticleTouch(), attract = false)
        }
        for (i in 0 until a.count) {
            assertEquals(a.x[i], b.x[i], 0f)
            assertEquals(a.y[i], b.y[i], 0f)
        }
    }

    @Test
    fun `lucioles qui clignotent, étoiles qui scintillent`() {
        assertEquals(0f, ParticleRules.fireflyGlow(0f), 1e-6f)
        assertEquals(1f, ParticleRules.fireflyGlow(0.225f), 1e-6f)
        assertEquals(0f, ParticleRules.fireflyGlow(0.6f), 0f)
        assertEquals(ParticleRules.fireflyGlow(0.1f), ParticleRules.fireflyGlow(1.1f), 1e-5f)
        for (i in 0..100) {
            val glow = ParticleRules.fireflyGlow(i / 100f)
            assertTrue(glow in 0f..1f)
            val twinkle = ParticleRules.twinkle(i * 0.37f, i * 0.91f)
            assertTrue(twinkle in 0.1f..1f)
        }
    }
}
