package io.karelisio.prisme.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GifMathTest {
    private val eps = 0.01f

    @Test
    fun `même proportion que l'écran, le média le remplit tel quel`() {
        val place = CoverFit.place(540, 1200, 1080, 2400)
        assertNotNull(place)
        assertEquals(2f, place!!.scale, eps)
        assertEquals(0f, place.left, eps)
        assertEquals(0f, place.top, eps)
        assertEquals(1080f, place.width, eps)
        assertEquals(2400f, place.height, eps)
    }

    @Test
    fun `média plus large que l'écran, centré, les côtés sont recadrés`() {
        val place = CoverFit.place(1920, 1080, 1080, 2400)!!
        // La hauteur remplit l'écran (2400 / 1080), la largeur dépasse des deux côtés.
        assertEquals(2400f / 1080f, place.scale, eps)
        assertEquals(1920 * 2400f / 1080f, place.width, eps)
        assertEquals(2400f, place.height, eps)
        assertEquals(0f, place.top, eps)
        assertEquals((1080f - place.width) / 2f, place.left, eps)
        assertTrue(place.left < 0f)
    }

    @Test
    fun `média plus haut que l'écran, centré, le haut et le bas sont recadrés`() {
        val place = CoverFit.place(1000, 3000, 1080, 2400)!!
        assertEquals(1.08f, place.scale, eps)
        assertEquals(1080f, place.width, eps)
        assertEquals(3240f, place.height, eps)
        assertEquals(0f, place.left, eps)
        assertEquals(-420f, place.top, eps)
    }

    @Test
    fun `l'écran est toujours entièrement couvert`() {
        val sizes = listOf(1 to 1, 16 to 9, 9 to 16, 480 to 270, 1080 to 2400, 3000 to 100, 100 to 3000)
        for ((srcW, srcH) in sizes) {
            for ((dstW, dstH) in sizes) {
                val place = CoverFit.place(srcW, srcH, dstW, dstH)!!
                assertTrue("$srcW×$srcH sur $dstW×$dstH : bord gauche", place.left <= eps)
                assertTrue("$srcW×$srcH sur $dstW×$dstH : bord haut", place.top <= eps)
                assertTrue("$srcW×$srcH sur $dstW×$dstH : bord droit", place.left + place.width >= dstW - eps)
                assertTrue("$srcW×$srcH sur $dstW×$dstH : bord bas", place.top + place.height >= dstH - eps)
            }
        }
    }

    @Test
    fun `taille inconnue, rien à placer`() {
        assertNull(CoverFit.place(0, 100, 1080, 2400))
        assertNull(CoverFit.place(100, 0, 1080, 2400))
        assertNull(CoverFit.place(100, 100, 0, 2400))
        assertNull(CoverFit.place(100, 100, 1080, 0))
    }

    @Test
    fun `un petit GIF n'est jamais agrandi au décodage`() {
        assertEquals(480 to 270, CoverFit.decodeSize(480, 270, 1080, 2400))
    }

    @Test
    fun `un grand GIF est décodé réduit, de quoi couvrir l'écran dans les deux orientations`() {
        // 4000×3000 sur 1080×2400 : couvrir demande ×0,8 en portrait (2400 / 3000) et ×0,6 en paysage.
        assertEquals(3200 to 2400, CoverFit.decodeSize(4000, 3000, 1080, 2400))
        // Même résultat si l'écran est mesuré en paysage.
        assertEquals(3200 to 2400, CoverFit.decodeSize(4000, 3000, 2400, 1080))
        // Écran 600×400 : en portrait (400×600), couvrir demande ×0,75 d'un 1200×800.
        assertEquals(900 to 600, CoverFit.decodeSize(1200, 800, 600, 400))
        // Plus petit que l'écran : jamais agrandi.
        assertEquals(300 to 200, CoverFit.decodeSize(300, 200, 600, 400))
    }

    @Test
    fun `décodage sans taille d'écran, taille d'origine`() {
        assertEquals(4000 to 3000, CoverFit.decodeSize(4000, 3000, 0, 0))
        assertEquals(1 to 1, CoverFit.decodeSize(0, 0, 1080, 2400))
    }

    @Test
    fun `l'horloge reboucle et ne compte pas les pauses`() {
        val clock = LoopClock(1_000)
        val ms = 1_000_000L
        assertEquals(0, clock.advance(5_000 * ms))
        assertEquals(250, clock.advance(5_250 * ms))
        // 850 ms plus tard : la boucle recommence.
        assertEquals(100, clock.advance(6_100 * ms))
        // Pause de dix secondes : à la reprise, le temps repart de la position où il s'était arrêté.
        clock.resume()
        assertEquals(100, clock.advance(16_100 * ms))
        assertEquals(150, clock.advance(16_150 * ms))
        // Une horloge qui reculerait ne fait pas reculer l'animation.
        assertEquals(150, clock.advance(16_000 * ms))
    }

    @Test
    fun `horloge d'une image fixe`() {
        val clock = LoopClock(0)
        assertEquals(0, clock.advance(10))
        assertEquals(0, clock.advance(10_000_000_000))
    }

    private fun argb(a: Int, r: Int, g: Int, b: Int) = (a shl 24) or (r shl 16) or (g shl 8) or b

    @Test
    fun `couleur dominante, la teinte la plus fréquente`() {
        val blue = argb(255, 20, 40, 200)
        val red = argb(255, 220, 30, 30)
        val pixels = IntArray(100) { if (it < 70) blue else red }
        assertEquals(blue, DominantColor.of(pixels))
    }

    @Test
    fun `couleur dominante, les teintes voisines se regroupent et sont moyennées`() {
        val pixels = intArrayOf(argb(255, 100, 100, 100), argb(255, 102, 100, 98), argb(255, 104, 100, 96), argb(255, 250, 0, 0))
        assertEquals(argb(255, 102, 100, 98), DominantColor.of(pixels))
    }

    @Test
    fun `couleur dominante, les pixels transparents sont ignorés`() {
        val pixels = IntArray(10) { if (it < 8) argb(0, 255, 255, 255) else argb(255, 10, 20, 30) }
        assertEquals(argb(255, 10, 20, 30), DominantColor.of(pixels))
        assertNull(DominantColor.of(IntArray(5) { argb(40, 1, 2, 3) }))
        assertNull(DominantColor.of(IntArray(0)))
    }
}
