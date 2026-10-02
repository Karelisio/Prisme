package io.karelisio.prisme.live

import io.karelisio.prisme.wallpaper.PixelRect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReliefMaskTest {
    /** Disque de confiance 1 (rayon [radius]) centré dans une image [size]×[size], 0 ailleurs. */
    private fun disk(size: Int, radius: Float, cx: Float = size / 2f, cy: Float = size / 2f) = FloatArray(size * size) {
        val x = it % size + 0.5f - cx
        val y = it / size + 0.5f - cy
        if (x * x + y * y <= radius * radius) 1f else 0f
    }

    @Test
    fun `couverture et rectangle du sujet`() {
        val mask = FloatArray(100)
        assertEquals(0f, ReliefMask.coverage(mask), 1e-6f)
        assertNull(ReliefMask.bounds(mask, 10, 10))
        // Sujet de 3×2 pixels en (4, 5).
        for (y in 5..6) for (x in 4..6) mask[y * 10 + x] = 0.9f
        assertEquals(0.06f, ReliefMask.coverage(mask), 1e-6f)
        assertEquals(PixelRect(4, 5, 7, 7), ReliefMask.bounds(mask, 10, 10))
        // Confiance sous le seuil : comptée dans le rectangle (valeur > 0) mais pas dans la couverture.
        mask[0] = 0.3f
        assertEquals(0.06f, ReliefMask.coverage(mask), 1e-6f)
        assertEquals(PixelRect(0, 0, 7, 7), ReliefMask.bounds(mask, 10, 10))
    }

    @Test
    fun `dilatation et érosion en carré`() {
        val dot = FloatArray(49).also { it[3 * 7 + 3] = 1f }
        val grown = ReliefMask.dilate(dot, 7, 7, 2)
        assertEquals(25f, grown.sum(), 1e-6f)
        assertEquals(PixelRect(1, 1, 6, 6), ReliefMask.bounds(grown, 7, 7))
        // L'érosion rend le point d'origine.
        val back = ReliefMask.erode(grown, 7, 7, 2)
        assertEquals(1f, back.sum(), 1e-6f)
        assertEquals(1f, back[3 * 7 + 3], 1e-6f)
        // Rayon nul : copie inchangée.
        assertTrue(dot.contentEquals(ReliefMask.dilate(dot, 7, 7, 0)))
    }

    @Test
    fun `le flou garde les aplats et la moyenne`() {
        val flat = FloatArray(12 * 9) { 0.4f }
        ReliefMask.boxBlur(flat, 12, 9, 3).forEach { assertEquals(0.4f, it, 1e-5f) }
        // Un point lumineux s'étale sur (2r+1)² pixels sans perdre d'énergie loin des bords.
        val dot = FloatArray(15 * 15).also { it[7 * 15 + 7] = 1f }
        val blurred = ReliefMask.boxBlur(dot, 15, 15, 2)
        assertEquals(1f, blurred.sum(), 1e-5f)
        assertEquals(1f / 25, blurred[7 * 15 + 7], 1e-6f)
        assertEquals(1f / 25, blurred[5 * 15 + 9], 1e-6f)
        assertEquals(0f, blurred[4 * 15 + 7], 1e-6f)
    }

    @Test
    fun `alpha du sujet aux bords progressifs, rien hors du contour`() {
        val size = 40
        val confidence = disk(size, 12f)
        val alpha = ReliefMask.subjectAlpha(confidence, size, size, shrink = 1, feather = 1)
        // Centre opaque, extérieur transparent, valeurs bornées.
        assertEquals(1f, alpha[20 * size + 20], 1e-6f)
        alpha.forEach { assertTrue(it in 0f..1f) }
        for (i in alpha.indices) if (confidence[i] == 0f) assertEquals("pixel $i hors du sujet", 0f, alpha[i], 1e-6f)
        // Le long d'un rayon, l'alpha décroît progressivement sur quelques pixels.
        val row = (0 until size).map { alpha[20 * size + it] }
        val partial = row.count { it > 0f && it < 1f }
        assertTrue("bord adouci : $row", partial in 2..8)
        for (x in 20 until size - 1) assertTrue(row[x + 1] <= row[x] + 1e-6f)
    }

    @Test
    fun `zone à combler élargie, sujet incertain compris`() {
        val size = 30
        val confidence = disk(size, 6f)
        // Mèche incertaine (confiance 0,3) : retirée du fond aussi.
        confidence[15 * size + 23] = 0.3f
        val hole = ReliefMask.hole(confidence, size, size, grow = 3)
        for (i in confidence.indices) if (confidence[i] >= ReliefMask.HOLE_THRESHOLD) assertEquals(1f, hole[i], 0f)
        assertEquals(1f, hole[15 * size + 26], 0f)
        assertEquals(0f, hole[15 * size + 27], 0f)
        // Le contour du disque est couvert avec 3 pixels de marge.
        val box = ReliefMask.bounds(hole, size, size)!!
        val disk = ReliefMask.bounds(ReliefMask.binary(disk(size, 6f), 0.5f), size, size)!!
        assertEquals(disk.left - 3, box.left)
        assertEquals(disk.top - 3, box.top)
        assertEquals(disk.bottom + 3, box.bottom)
    }

    @Test
    fun `ombre noire et floue dans une image élargie`() {
        val alpha = IntArray(10 * 10) { 255 }
        val shadow = ReliefMask.shadow(alpha, 10, 10, 4)
        assertEquals(18 * 18, shadow.size)
        shadow.forEach { assertEquals(0, it and 0xFFFFFF) }
        val center = shadow[9 * 18 + 9] ushr 24
        val corner = shadow[0] ushr 24
        val edge = shadow[9 * 18 + 4] ushr 24
        assertEquals(255, center)
        assertEquals(0, corner)
        assertTrue("bord à demi : $edge", edge in 60..200)
    }

    @Test
    fun `interpolation et mélange des couleurs`() {
        val values = floatArrayOf(0f, 1f, 2f, 3f)
        assertEquals(0f, ReliefMask.sample(values, 2, 2, 0f, 0f), 1e-6f)
        assertEquals(1.5f, ReliefMask.sample(values, 2, 2, 0.5f, 0.5f), 1e-6f)
        // Hors de l'image : bords prolongés.
        assertEquals(3f, ReliefMask.sample(values, 2, 2, 5f, 5f), 1e-6f)
        val black = ReliefMask.OPAQUE
        val white = -1
        assertEquals(ReliefMask.rgb(128f, 128f, 128f), ReliefMask.sampleColor(intArrayOf(black, white), 2, 1, 0.5f, 0f))
        assertEquals(black, ReliefMask.mix(black, white, 0f))
        assertEquals(white, ReliefMask.mix(black, white, 1f))
        assertEquals(ReliefMask.rgb(64f, 64f, 64f), ReliefMask.mix(black, white, 0.25f))
    }

    @Test
    fun `léger flou réservé à la zone comblée`() {
        val width = 8
        // Moitié noire, moitié blanche ; zone comblée à droite seulement.
        val pixels = IntArray(width * width) { if (it % width < 4) ReliefMask.OPAQUE else -1 }
        val weight = FloatArray(pixels.size) { if (it % width >= 5) 1f else 0f }
        val out = ReliefMask.blurInside(pixels, width, width, weight, 2)
        for (i in pixels.indices) {
            if (weight[i] == 0f) assertEquals(pixels[i], out[i])
        }
        // Colonne 5 : la moitié noire voisine assombrit un peu le blanc ; au-delà du flou, rien ne change.
        assertEquals(204, out[3 * width + 5] and 0xFF)
        assertEquals(-1, out[3 * width + 7])
    }
}
