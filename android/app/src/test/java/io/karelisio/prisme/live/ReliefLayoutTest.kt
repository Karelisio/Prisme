package io.karelisio.prisme.live

import io.karelisio.prisme.wallpaper.PixelRect
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReliefLayoutTest {
    private val screenW = 1080
    private val screenH = 2400

    /** Image préparée pour cet écran, sujet de 600×1500 posé sur le bord bas de la photo. */
    private fun layout(depth: Float, subjectTop: Int = 1284): ReliefLayout {
        val (imageW, imageH) = ParallaxMath.bitmapSize(screenW, screenH, ReliefMath.MARGIN)
        return ReliefLayout().apply { configure(screenW, screenH, imageW, imageH, 300, subjectTop, 600, imageH - subjectTop, 20f, depth) }
    }

    private val tilts = listOf(-1f to -1f, -1f to 1f, 1f to -1f, 1f to 1f, 0.4f to -0.7f, 0f to 0f)

    @Test
    fun `l'arrière-plan couvre toujours l'écran`() {
        for (depth in listOf(0f, 0.5f, 1f)) {
            val layout = layout(depth)
            for ((x, y) in tilts + listOf(3f to -3f)) {
                layout.update(x, y)
                val bg = layout.background
                assertTrue("gauche $depth $x", bg[0] <= 0f)
                assertTrue("haut $depth $y", bg[1] <= 0f)
                assertTrue("droite $depth $x", bg[2] >= screenW)
                assertTrue("bas $depth $y", bg[3] >= screenH)
            }
        }
    }

    @Test
    fun `au repos, sujet et arrière-plan alignés, le sujet à peine agrandi`() {
        val layout = layout(0.5f)
        layout.update(0f, 0f)
        val bg = layout.background
        val fg = layout.subject
        val scale = (bg[2] - bg[0]) / ParallaxMath.bitmapSize(screenW, screenH, ReliefMath.MARGIN).first
        assertEquals(1f, scale, 0.002f)
        // Centre du sujet à sa place dans l'image.
        assertEquals(bg[0] + 600 * scale, (fg[0] + fg[2]) / 2, 0.5f)
        val zoom = (fg[2] - fg[0]) / (600 * scale)
        assertTrue("zoom $zoom", zoom > 1f && zoom < 1.03f)
    }

    @Test
    fun `le sujet glisse plus que l'arrière-plan, dans le même sens`() {
        val layout = layout(1f)
        layout.update(0f, 0f)
        val bgRest = layout.background[0]
        val fgRest = layout.subject[0]
        layout.update(1f, 0.5f)
        val bgMove = layout.background[0] - bgRest
        val fgMove = layout.subject[0] - fgRest
        assertTrue(bgMove < 0f && fgMove < 0f)
        assertTrue("sujet $fgMove, fond $bgMove", fgMove < 3 * bgMove)
        // Course du sujet : toute la marge à pleine profondeur, moins à profondeur 0.
        assertEquals(screenW * ReliefMath.MARGIN, layout.subjectTravelX, 1f)
        assertTrue(layout(0f).subjectTravelX < layout(1f).subjectTravelX / 3)
        assertTrue(layout(0f).subjectTravelX > 0f)
    }

    @Test
    fun `les bords du sujet coupés par le cadre de la photo restent hors de l'écran`() {
        for (depth in listOf(0f, 0.5f, 1f)) {
            val layout = layout(depth)
            for ((x, y) in tilts) {
                layout.update(x, y)
                assertTrue("bas du sujet ${layout.subject[3]} ($depth, $x, $y)", layout.subject[3] >= screenH)
            }
        }
        // Sujet collé au bord gauche de la photo.
        val (imageW, imageH) = ParallaxMath.bitmapSize(screenW, screenH, ReliefMath.MARGIN)
        val left = ReliefLayout().apply { configure(screenW, screenH, imageW, imageH, 0, 500, 400, 900, 0f, 1f) }
        for ((x, y) in tilts) {
            left.update(x, y)
            assertTrue(left.subject[0] <= 0f)
        }
    }

    @Test
    fun `l'ombre suit l'arrière-plan, un peu plus bas que le sujet`() {
        val layout = layout(1f)
        layout.update(0f, 0f)
        // Débordement du flou autour du sujet, et décalage vers le bas.
        assertTrue(layout.shadow[0] < layout.subject[0] && layout.shadow[2] > layout.subject[2])
        val drop = (layout.shadow[1] + layout.shadow[3]) / 2 - (layout.subject[1] + layout.subject[3]) / 2
        assertEquals(screenH * ReliefMath.SHADOW_DROP, drop, 0.01f)
        val shadowRest = layout.shadow[0]
        val bgRest = layout.background[0]
        layout.update(-1f, 0f)
        assertEquals(layout.background[0] - bgRest, layout.shadow[0] - shadowRest, 0.01f)
    }

    @Test
    fun `réglages de la scène lus depuis l'app`() {
        assertEquals(ReliefSettings(0.5f, true), ReliefSettings.from(JSONObject()))
        assertEquals(ReliefSettings(0.8f, false), ReliefSettings.from(JSONObject("""{"depth":0.8,"shadow":false}""")))
        assertEquals(1f, ReliefSettings.from(JSONObject("""{"depth":7}""")).depth, 0f)
        assertEquals(0.5f, ReliefSettings.from(JSONObject("""{"depth":"beaucoup"}""")).depth, 0f)
        assertEquals(0.2f, ReliefMath.strength(0f), 1e-6f)
        assertEquals(1f, ReliefMath.strength(1f), 1e-6f)
        assertEquals(ReliefMath.strength(0.5f), ReliefMath.strength(Float.NaN), 1e-6f)
    }

    @Test
    fun `tailles de travail et rectangles ramenés à la pleine taille`() {
        assertEquals(576 to 1280, ReliefMath.workSize(1253, 2784))
        assertEquals(800 to 600, ReliefMath.workSize(800, 600))
        assertEquals(5, ReliefMath.growRadius(576, 1280))
        assertEquals(3, ReliefMath.growRadius(50, 80))
        val full = ReliefMath.scaleBox(PixelRect(10, 20, 30, 40), 100, 200, 250, 500, 2)
        assertEquals(PixelRect(23, 48, 77, 102), full)
        // Contenu dans l'image.
        assertEquals(PixelRect(0, 0, 250, 500), ReliefMath.scaleBox(PixelRect(0, 0, 100, 200), 100, 200, 250, 500, 5))
    }

    @Test
    fun `relief enregistré relu, incomplet ignoré`() {
        val prepared = ReliefStore.Prepared(
            background = "/files/live/relief/background-1.jpg",
            subject = "/files/live/relief/subject-1.png",
            preview = "/files/live/relief/preview-1.png",
            imageWidth = 1253,
            imageHeight = 2784,
            subjectLeft = 120,
            subjectTop = 900,
            subjectWidth = 700,
            subjectHeight = 1884,
            source = "https://images.example/photo.jpg",
            coverage = 0.31f,
        )
        assertEquals(prepared, ReliefStore.Prepared.parse(prepared.toJson().toString()))
        assertNull(ReliefStore.Prepared.parse(null))
        assertNull(ReliefStore.Prepared.parse("pas du json"))
        assertNull(ReliefStore.Prepared.parse("""{"background":"/a.jpg"}"""))
        assertNull(ReliefStore.Prepared.parse(prepared.copy(subjectWidth = 0).toJson().toString()))
    }
}
