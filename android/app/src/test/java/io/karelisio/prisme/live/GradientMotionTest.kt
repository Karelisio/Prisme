package io.karelisio.prisme.live

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class GradientMotionTest {
    private fun channel(color: Int, shift: Int) = (color ushr shift) and 0xFF

    /** Luminosité approximative (0..1). */
    private fun luma(color: Int) = (0.2126f * channel(color, 16) + 0.7152f * channel(color, 8) + 0.0722f * channel(color, 0)) / 255f

    @Test
    fun `palettes proposées, Material You en premier, bases sombres et couleurs opaques`() {
        assertEquals(listOf("system", "aurora", "sunset", "ocean", "forest", "neon", "pastel"), MotionPalettes.KEYS)
        for (palette in MotionPalettes.PRESETS) {
            assertEquals(palette.key, 5, palette.colors.size)
            assertTrue(palette.key, luma(palette.base) < 0.1f)
            for (color in palette.colors) assertEquals(0xFF, channel(color, 24))
            // Les couleurs des taches ressortent de la base.
            assertTrue(palette.key, palette.colors.all { luma(it) > luma(palette.base) + 0.15f })
        }
        assertEquals("aurora", MotionPalettes.normalize(null))
        assertEquals("aurora", MotionPalettes.normalize("inconnue"))
        assertEquals("neon", MotionPalettes.normalize("neon"))
        assertNull(MotionPalettes.preset(MotionPalettes.SYSTEM))
    }

    @Test
    fun `double-tap, palette suivante, en boucle`() {
        assertEquals("aurora", MotionPalettes.next("system"))
        assertEquals("system", MotionPalettes.next("pastel"))
        assertEquals("system", MotionPalettes.next("inconnue"))
        var key = "ocean"
        repeat(MotionPalettes.KEYS.size) { key = MotionPalettes.next(key) }
        assertEquals("ocean", key)
    }

    @Test
    fun `palette du double-tap gardée tant que l'app ne change pas la sienne`() {
        assertEquals("ocean", GradientMotion.shownPalette("aurora", "aurora", "ocean"))
        // Nouvelle palette choisie dans l'app : elle l'emporte.
        assertEquals("neon", GradientMotion.shownPalette("neon", "aurora", "ocean"))
        assertEquals("aurora", GradientMotion.shownPalette("aurora", null, null))
        assertEquals("aurora", GradientMotion.shownPalette("aurora", "aurora", "disparue"))
    }

    @Test
    fun `mélange et lecture des couleurs`() {
        val black = 0xFF000000.toInt()
        val white = 0xFFFFFFFF.toInt()
        assertEquals(black, MotionPalettes.lerpColor(black, white, 0f))
        assertEquals(white, MotionPalettes.lerpColor(black, white, 1f))
        assertEquals(0xFF808080.toInt(), MotionPalettes.lerpColor(black, white, 0.5f))
        assertEquals(white, MotionPalettes.lerpColor(black, white, 4f))
        assertEquals(0xFF6750A4.toInt(), MotionPalettes.parseColor("#6750a4"))
        assertEquals(0xFF00FF00.toInt(), MotionPalettes.parseColor(" 00FF00 "))
        assertNull(MotionPalettes.parseColor("#12345"))
        assertNull(MotionPalettes.parseColor("vert"))
        assertNull(MotionPalettes.parseColor(null))
    }

    @Test
    fun `teinte, saturation, luminosité, aller-retour`() {
        for (color in listOf(0xFF6750A4.toInt(), 0xFF12D99B.toInt(), 0xFFFF6B3D.toInt(), 0xFF808080.toInt(), 0xFF0B1020.toInt())) {
            val hsl = MotionPalettes.toHsl(color)
            val back = MotionPalettes.fromHsl(hsl[0], hsl[1], hsl[2])
            for (shift in intArrayOf(16, 8, 0)) assertTrue(abs(channel(color, shift) - channel(back, shift)) <= 1)
        }
        assertEquals(0xFFFF0000.toInt(), MotionPalettes.fromHsl(360f, 1f, 0.5f))
    }

    @Test
    fun `sans Material You, palette tirée de la couleur d'accent`() {
        val palette = MotionPalettes.fromAccent(MotionPalettes.APP_ACCENT)
        assertEquals(MotionPalettes.SYSTEM, palette.key)
        assertEquals(5, palette.colors.size)
        assertTrue(luma(palette.base) < 0.08f)
        val accentHue = MotionPalettes.toHsl(MotionPalettes.APP_ACCENT)[0]
        assertEquals(accentHue, MotionPalettes.toHsl(palette.colors[0])[0], 3f)
        assertEquals(5, palette.colors.distinct().size)
        // Couleurs du système : base presque noire, teintée.
        val system = MotionPalettes.fromSystem(0xD0BCFF, 0x7F67BE, 0x7A7289, 0xB4738A, 0x7D5260, 0x21005D)
        assertTrue(luma(system.base) < 0.05f)
        assertEquals(0xFF7F67BE.toInt(), system.colors[0])
    }

    @Test
    fun `taches, mouvement continu, qui reste autour de l'écran`() {
        val pose = FloatArray(GradientMotion.POSE_SIZE)
        val previous = FloatArray(GradientMotion.POSE_SIZE)
        for (blob in GradientMotion.BLOBS) {
            var t = 0.0
            GradientMotion.pose(blob, t, previous)
            repeat(20_000) {
                t += 0.05
                GradientMotion.pose(blob, t, pose)
                assertTrue(pose[GradientMotion.X] in -0.2f..1.2f)
                assertTrue(pose[GradientMotion.Y] in -0.2f..1.2f)
                assertTrue(pose[GradientMotion.RX] > 0.3f)
                assertTrue(pose[GradientMotion.RY] >= pose[GradientMotion.RX])
                // Pas de saut d'une image à l'autre.
                assertTrue(abs(pose[GradientMotion.X] - previous[GradientMotion.X]) < 0.01f)
                assertTrue(abs(pose[GradientMotion.Y] - previous[GradientMotion.Y]) < 0.01f)
                assertTrue(abs(pose[GradientMotion.ANGLE] - previous[GradientMotion.ANGLE]) < 1f)
                pose.copyInto(previous)
            }
        }
    }

    @Test
    fun `profil des taches en cloche, nul au bord`() {
        assertEquals(1f, GradientMotion.profile(0f), 1e-6f)
        assertEquals(0f, GradientMotion.profile(1f), 1e-6f)
        assertEquals(0f, GradientMotion.profile(1.4f), 1e-6f)
        var last = 1f
        for (i in 1..100) {
            val value = GradientMotion.profile(i / 100f)
            assertTrue(value <= last)
            last = value
        }
    }

    @Test
    fun `réglages lus du JSON, valeurs par défaut sinon`() {
        val defaults = GradientMotion.settings(JSONObject())
        assertEquals("aurora", defaults.palette)
        assertEquals(GradientMotion.Speed.SLOW, defaults.speed)
        assertTrue(defaults.grain)
        assertEquals(MotionPalettes.APP_ACCENT, defaults.accent)
        val custom = GradientMotion.settings(JSONObject("""{"palette":"neon","speed":"fast","grain":false,"accent":"#00ff00"}"""))
        assertEquals("neon", custom.palette)
        assertEquals(GradientMotion.Speed.FAST, custom.speed)
        assertFalse(custom.grain)
        assertEquals(0xFF00FF00.toInt(), custom.accent)
        assertEquals("aurora", GradientMotion.settings(JSONObject("""{"palette":"bidon","speed":"turbo"}""")).palette)
    }

    @Test
    fun `vitesses croissantes, cadence modeste`() {
        val speeds = GradientMotion.Speed.entries
        assertEquals(speeds.sortedBy { it.factor }, speeds)
        assertTrue(speeds.all { it.fps <= 30 })
        assertEquals(GradientMotion.Speed.MEDIUM, GradientMotion.Speed.fromKey("medium"))
        assertEquals(GradientMotion.Speed.SLOW, GradientMotion.Speed.fromKey(null))
    }

    @Test
    fun `fondu doux entre palettes`() {
        assertEquals(0f, GradientMotion.fade(0), 1e-6f)
        assertEquals(0f, GradientMotion.fade(-50), 1e-6f)
        assertEquals(0.5f, GradientMotion.fade(GradientMotion.FADE_MS / 2), 1e-6f)
        assertEquals(1f, GradientMotion.fade(GradientMotion.FADE_MS), 1e-6f)
        assertEquals(1f, GradientMotion.fade(GradientMotion.FADE_MS * 3), 1e-6f)
    }

    @Test
    fun `horloge, reprise sans saut après une pause, écarts bornés`() {
        val clock = MotionClock(maxStepNanos = 100_000_000L)
        assertEquals(0f, clock.tick(1_000_000_000L), 0f)
        assertEquals(0.016f, clock.tick(1_016_000_000L), 1e-6f)
        clock.pause()
        // Huit secondes masqué : la première image après la pause n'avance pas.
        assertEquals(0f, clock.tick(9_000_000_000L), 0f)
        assertEquals(0.033f, clock.tick(9_033_000_000L), 1e-6f)
        // Image très en retard : l'animation n'avance que de 100 ms.
        assertEquals(0.1f, clock.tick(11_000_000_000L), 1e-6f)
        // Horloge qui recule : rien.
        assertEquals(0f, clock.tick(10_000_000_000L), 0f)
    }
}
