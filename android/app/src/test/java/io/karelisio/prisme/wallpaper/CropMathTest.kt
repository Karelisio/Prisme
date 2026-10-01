package io.karelisio.prisme.wallpaper

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CropMathTest {
    private val screenW = 1080
    private val screenH = 2400
    private val screenAspect = screenW.toDouble() / screenH

    private fun assertAspect(rect: PixelRect) {
        val aspect = rect.width.toDouble() / rect.height
        assertEquals(screenAspect, aspect, 0.01)
    }

    private fun assertInside(rect: PixelRect, w: Int, h: Int) {
        assertTrue("left ${rect.left}", rect.left >= 0)
        assertTrue("top ${rect.top}", rect.top >= 0)
        assertTrue("right ${rect.right}", rect.right <= w)
        assertTrue("bottom ${rect.bottom}", rect.bottom <= h)
    }

    @Test
    fun `sans recadrage, zone centrée au ratio de l'écran sur une image paysage`() {
        val rect = CropMath.resolveCrop(4000, 3000, null, screenW, screenH)
        assertEquals(3000, rect.height)
        assertAspect(rect)
        assertEquals((4000 - rect.width) / 2.0, rect.left.toDouble(), 1.0)
        assertInside(rect, 4000, 3000)
    }

    @Test
    fun `sans recadrage, image portrait plus haute que l'écran`() {
        val rect = CropMath.resolveCrop(3000, 9000, null, screenW, screenH)
        assertEquals(3000, rect.width)
        assertAspect(rect)
        assertEquals((9000 - rect.height) / 2.0, rect.top.toDouble(), 1.0)
    }

    @Test
    fun `un recadrage au bon ratio est conservé`() {
        val crop = NormalizedRect(0.1, 0.2, 0.45 * 0.5, 0.5)
        val rect = CropMath.resolveCrop(4000, 4000, crop, screenW, screenH)
        assertEquals(400, rect.left)
        assertEquals(800, rect.top)
        assertEquals(2000, rect.height)
        assertEquals(900, rect.width)
    }

    @Test
    fun `un recadrage qui déborde est ramené dans l'image`() {
        val crop = NormalizedRect(0.9, 0.9, 0.5, 0.5)
        val rect = CropMath.resolveCrop(2000, 4000, crop, screenW, screenH)
        assertInside(rect, 2000, 4000)
        assertAspect(rect)
    }

    @Test
    fun `un recadrage invalide revient à l'image entière`() {
        val crop = NormalizedRect(Double.NaN, 0.0, 1.0, 1.0)
        assertEquals(
            CropMath.resolveCrop(3000, 6000, null, screenW, screenH),
            CropMath.resolveCrop(3000, 6000, crop, screenW, screenH),
        )
    }

    @Test
    fun `une image minuscule donne au moins un pixel`() {
        val rect = CropMath.resolveCrop(1, 1, NormalizedRect(0.0, 0.0, 0.0, 0.0), screenW, screenH)
        assertTrue(rect.width >= 1 && rect.height >= 1)
        assertInside(rect, 1, 1)
    }

    @Test
    fun `facteur de sous-échantillonnage`() {
        assertEquals(1, CropMath.sampleSize(1080, 2400, 1080, 2400))
        assertEquals(2, CropMath.sampleSize(2160, 4800, 1080, 2400))
        assertEquals(2, CropMath.sampleSize(3000, 6000, 1080, 2400))
        assertEquals(4, CropMath.sampleSize(4320, 9600, 1080, 2400))
        assertEquals(1, CropMath.sampleSize(500, 800, 1080, 2400))
    }
}
