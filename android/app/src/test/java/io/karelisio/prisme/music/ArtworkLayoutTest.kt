package io.karelisio.prisme.music

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class ArtworkLayoutTest {
    private val screenWidth = 1080
    private val screenHeight = 2400

    private fun layout(artWidth: Int, artHeight: Int, w: Int = screenWidth, h: Int = screenHeight) = ArtworkLayout.compute(w, h, artWidth, artHeight)

    @Test
    fun `pochette carrée aux trois quarts de la largeur, centrée un peu au-dessus du milieu`() {
        val fg = layout(1000, 1000).foreground
        // 72 % de 1080 px
        assertTrue(abs(fg.width - 778) <= 1)
        assertEquals(fg.width, fg.height)
        // Centrée horizontalement.
        assertTrue(abs(fg.left - (screenWidth - fg.right)) <= 1)
        // Centre vertical au-dessus du milieu de l'écran, mais pas collé en haut.
        val centerY = fg.top + fg.height / 2f
        assertTrue(centerY < screenHeight / 2f)
        assertTrue(centerY > screenHeight * 0.35f)
    }

    @Test
    fun `fond recadré au ratio de l'écran, au centre de la pochette`() {
        val aspect = screenWidth.toDouble() / screenHeight

        val square = layout(1000, 1000).backgroundSource
        assertEquals(1000, square.height)
        assertEquals(450, square.width)
        assertEquals(275, square.left)
        assertEquals(0, square.top)

        val wide = layout(1600, 900).backgroundSource
        assertEquals(900, wide.height)
        assertEquals(405, wide.width)
        assertEquals((1600 - 405) / 2, wide.left)

        val tall = layout(500, 2000).backgroundSource
        assertEquals(500, tall.width)
        assertEquals(1111, tall.height)
        assertEquals((2000 - 1111) / 2, tall.top)

        for (box in listOf(square, wide, tall)) assertEquals(aspect, box.width.toDouble() / box.height, 0.01)
    }

    @Test
    fun `le fond reste dans la pochette, même minuscule`() {
        for ((w, h) in listOf(1 to 1, 3 to 7, 64 to 64, 4000 to 100, 100 to 4000)) {
            val box = layout(w, h).backgroundSource
            assertTrue("$w x $h", box.left >= 0 && box.top >= 0 && box.width >= 1 && box.height >= 1)
            assertTrue("$w x $h", box.right <= w && box.bottom <= h)
        }
    }

    @Test
    fun `pochette en largeur ou en hauteur garde son ratio`() {
        val wide = layout(1600, 900).foreground
        assertEquals(900.0 / 1600, wide.height.toDouble() / wide.width, 0.01)
        assertTrue(abs(wide.width - 778) <= 1)

        val portrait = layout(900, 1600).foreground
        assertEquals(1600.0 / 900, portrait.height.toDouble() / portrait.width, 0.01)
    }

    @Test
    fun `pochette très haute ramenée à la hauteur permise`() {
        val fg = layout(500, 2000).foreground
        assertEquals(screenHeight * ArtworkLayout.MAX_HEIGHT.toDouble(), fg.height.toDouble(), 1.0)
        assertTrue(fg.width < screenWidth * ArtworkLayout.FOREGROUND_WIDTH)
        assertEquals(500.0 / 2000, fg.width.toDouble() / fg.height, 0.01)
    }

    @Test
    fun `la pochette nette reste toujours dans l'écran, avec une marge`() {
        val screens = listOf(1080 to 2400, 720 to 1280, 1440 to 3200, 1200 to 1920, 480 to 800)
        val arts = listOf(1 to 1, 4 to 3, 16 to 9, 9 to 16, 1 to 3, 3 to 1, 1 to 10, 10 to 1, 640 to 640)
        for ((sw, sh) in screens) {
            for ((aw, ah) in arts) {
                val fg = layout(aw, ah, sw, sh).foreground
                val label = "écran $sw x $sh, pochette $aw x $ah"
                assertTrue(label, fg.left >= 0 && fg.right <= sw)
                assertTrue(label, fg.top >= (sh * ArtworkLayout.EDGE_MARGIN).toInt() - 1)
                assertTrue(label, fg.bottom <= sh - (sh * ArtworkLayout.EDGE_MARGIN).toInt() + 1)
                assertTrue(label, fg.width >= 1 && fg.height >= 1)
            }
        }
    }

    @Test
    fun `coins arrondis et ombre proportionnels à l'image`() {
        val l = layout(1000, 1000)
        assertEquals(l.foreground.width * ArtworkLayout.CORNER_RADIUS, l.cornerRadius, 0.01f)
        assertTrue(l.cornerRadius > 0f)
        assertEquals(screenWidth * ArtworkLayout.SHADOW_BLUR, l.shadowBlur, 0.01f)
        assertTrue(l.shadowOffset > 0f && l.shadowOffset < l.shadowBlur)
        // Une pochette large a des coins moins arrondis que sa largeur ne le laisserait penser : on suit le petit côté.
        val wide = layout(1600, 900)
        assertEquals(wide.foreground.height * ArtworkLayout.CORNER_RADIUS, wide.cornerRadius, 0.01f)
    }

    @Test
    fun `flou en deux étapes de plus en plus grandes, toutes plus petites que l'écran`() {
        val l = layout(1000, 1000)
        assertEquals(screenWidth / ArtworkLayout.BLUR_DIVISOR, l.blurSmall.width)
        assertEquals(screenHeight / ArtworkLayout.BLUR_DIVISOR, l.blurSmall.height)
        assertTrue(l.blurSmall.width < l.blurMiddle.width && l.blurSmall.height < l.blurMiddle.height)
        assertTrue(l.blurMiddle.width < screenWidth && l.blurMiddle.height < screenHeight)
        // Même ratio que l'écran, à l'arrondi près.
        val aspect = screenWidth.toDouble() / screenHeight
        assertEquals(aspect, l.blurSmall.width.toDouble() / l.blurSmall.height, 0.02)
        assertEquals(aspect, l.blurMiddle.width.toDouble() / l.blurMiddle.height, 0.01)
    }

    @Test
    fun `petit écran, le flou garde une taille minimale`() {
        val l = layout(100, 100, 40, 80)
        assertTrue(l.blurSmall.width >= 8 && l.blurSmall.height >= 8)
        assertTrue(l.blurMiddle.width >= l.blurSmall.width && l.blurMiddle.height >= l.blurSmall.height)
        assertTrue(l.foreground.width >= 1 && l.foreground.height >= 1)
    }

    @Test
    fun `dimensions vides refusées`() {
        assertThrows(IllegalArgumentException::class.java) { ArtworkLayout.compute(0, 2400, 100, 100) }
        assertThrows(IllegalArgumentException::class.java) { ArtworkLayout.compute(1080, 0, 100, 100) }
        assertThrows(IllegalArgumentException::class.java) { ArtworkLayout.compute(1080, 2400, 0, 100) }
        assertThrows(IllegalArgumentException::class.java) { ArtworkLayout.compute(1080, 2400, 100, 0) }
    }
}
