package io.karelisio.prisme.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class PushPullTest {
    private fun red(c: Int) = (c shr 16) and 0xFF
    private fun green(c: Int) = (c shr 8) and 0xFF
    private fun blue(c: Int) = c and 0xFF

    /** Trou rectangulaire [x0, x1[ × [y0, y1[ (poids 0), le reste connu. */
    private fun holeMask(width: Int, height: Int, x0: Int, y0: Int, x1: Int, y1: Int) =
        FloatArray(width * height) { if (it % width in x0 until x1 && it / width in y0 until y1) 0f else 1f }

    @Test
    fun `les pixels connus ne changent pas, le trou prend la couleur du fond`() {
        val width = 37
        val height = 23
        val color = ReliefMask.rgb(30f, 120f, 200f)
        val pixels = IntArray(width * height) { color }
        val known = holeMask(width, height, 10, 5, 25, 18)
        // Le sujet (à effacer) est rouge vif.
        for (i in pixels.indices) if (known[i] == 0f) pixels[i] = ReliefMask.rgb(255f, 0f, 0f)
        val filled = PushPull.fill(pixels, width, height, known)
        for (i in pixels.indices) {
            if (known[i] == 1f) {
                assertEquals(pixels[i], filled[i])
            } else {
                assertEquals(color, filled[i])
            }
        }
    }

    @Test
    fun `entre deux couleurs, le trou passe progressivement de l'une à l'autre`() {
        val width = 64
        val height = 16
        // Bleu à gauche, vert à droite ; trou au milieu, sur toute la hauteur.
        val pixels = IntArray(width * height) { if (it % width < width / 2) ReliefMask.rgb(0f, 0f, 255f) else ReliefMask.rgb(0f, 255f, 0f) }
        val known = holeMask(width, height, 16, 0, 48, height)
        val filled = PushPull.fill(pixels, width, height, known)
        val row = 8 * width
        // Aucune trace du contour d'origine : le vert augmente et le bleu diminue de gauche à droite.
        for (x in 16 until 47) {
            assertTrue("vert en $x", green(filled[row + x + 1]) >= green(filled[row + x]) - 2)
            assertTrue("bleu en $x", blue(filled[row + x + 1]) <= blue(filled[row + x]) + 2)
        }
        assertTrue(blue(filled[row + 17]) > green(filled[row + 17]))
        assertTrue(green(filled[row + 46]) > blue(filled[row + 46]))
        // Au milieu du trou, un mélange des deux.
        val middle = filled[row + 32]
        assertTrue(abs(green(middle) - blue(middle)) < 90)
        filled.forEach { assertEquals(0xFF, it ushr 24) }
    }

    @Test
    fun `un seul pixel connu remplit toute l'image, aucun donne du gris`() {
        val width = 9
        val height = 5
        val color = ReliefMask.rgb(10f, 200f, 90f)
        val pixels = IntArray(width * height) { ReliefMask.OPAQUE }
        pixels[3 * width + 7] = color
        val known = FloatArray(width * height).also { it[3 * width + 7] = 1f }
        PushPull.fill(pixels, width, height, known).forEach { assertEquals(color, it) }
        val gray = ReliefMask.rgb(128f, 128f, 128f)
        PushPull.fill(pixels, width, height, FloatArray(width * height)).forEach { assertEquals(gray, it) }
    }

    @Test
    fun `tailles impaires et minuscules, poids partiels`() {
        for ((w, h) in listOf(1 to 1, 1 to 7, 7 to 1, 3 to 2, 5 to 9)) {
            val pixels = IntArray(w * h) { ReliefMask.rgb(it * 10f, 50f, 100f) }
            val known = FloatArray(w * h) { if (it % 2 == 0) 1f else 0f }
            val filled = PushPull.fill(pixels, w, h, known)
            assertEquals(w * h, filled.size)
            for (i in filled.indices) if (known[i] == 1f) assertEquals(pixels[i], filled[i])
        }
        // Poids 0,5 : moitié couleur d'origine, moitié comblement (ici le noir voisin).
        val pixels = intArrayOf(ReliefMask.OPAQUE, ReliefMask.OPAQUE, -1, ReliefMask.OPAQUE)
        val known = floatArrayOf(1f, 1f, 0.5f, 1f)
        val mixed = PushPull.fill(pixels, 2, 2, known)[2]
        assertTrue("mélange : ${red(mixed)}", red(mixed) in 100..200)
    }
}
