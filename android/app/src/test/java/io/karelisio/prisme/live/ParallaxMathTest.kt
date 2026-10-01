package io.karelisio.prisme.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ParallaxMathTest {
    @Test
    fun `marge bornée selon l'intensité`() {
        assertEquals(0.02f, ParallaxMath.margin(0f), 1e-6f)
        assertEquals(0.10f, ParallaxMath.margin(1f), 1e-6f)
        assertEquals(0.10f, ParallaxMath.margin(5f), 1e-6f)
        assertEquals(1296 to 2880, ParallaxMath.bitmapSize(1080, 2400, 0.1f))
    }

    @Test
    fun `téléphone tenu droit, aucune inclinaison latérale`() {
        val (sideways, forward) = ParallaxMath.tilt(0f, 9.81f, 0f)
        assertEquals(0f, sideways, 1e-4f)
        assertEquals(0f, forward, 1e-4f)
        val (tiltedRight, _) = ParallaxMath.tilt(3f, 9f, 2f)
        assertTrue(tiltedRight > 0f)
    }

    @Test
    fun `décalage normalisé, borné, et repos qui suit la tenue`() {
        assertEquals(0f, ParallaxMath.normalized(0.2f, 0.2f), 1e-6f)
        assertEquals(1f, ParallaxMath.normalized(2f, 0f), 1e-6f)
        assertEquals(-1f, ParallaxMath.normalized(-2f, 0f), 1e-6f)
        var baseline = 0f
        repeat(500) { baseline = ParallaxMath.recenter(baseline, 0.5f) }
        assertEquals(0.5f, baseline, 0.01f)
    }

    @Test
    fun `l'image couvre toujours l'écran`() {
        val margin = 100f
        for (n in listOf(-1f, -0.3f, 0f, 0.7f, 1f)) {
            val left = ParallaxMath.drawOffset(n, margin)
            assertTrue(left <= 0f)
            assertTrue(left >= -2 * margin)
        }
        assertEquals(-margin, ParallaxMath.drawOffset(0f, margin), 1e-6f)
        assertEquals(0.5f, ParallaxMath.smooth(0f, 1f, 0.5f), 1e-6f)
    }
}
