package io.karelisio.prisme.widget

import io.karelisio.prisme.wallpaper.WallpaperTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class WidgetThumbnailTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private fun sizeFor(width: Int, height: Int) = WidgetThumbnail.sizeFor(width, height)

    @Test
    fun `écrans courants, 360 px de large aux proportions de l'écran`() {
        assertEquals(WidgetThumbnail.Size(360, 800), sizeFor(1080, 2400))
        assertEquals(WidgetThumbnail.Size(360, 800), sizeFor(1440, 3200))
        assertEquals(WidgetThumbnail.Size(360, 780), sizeFor(1080, 2340))
        assertEquals(WidgetThumbnail.Size(360, 640), sizeFor(720, 1280))
        assertEquals(WidgetThumbnail.Size(360, 576), sizeFor(1200, 1920))
    }

    @Test
    fun `la miniature n'est jamais agrandie`() {
        assertEquals(WidgetThumbnail.Size(320, 480), sizeFor(320, 480))
        assertEquals(WidgetThumbnail.Size(200, 400), sizeFor(200, 400))
        assertEquals(WidgetThumbnail.Size(360, 640), sizeFor(360, 640))
    }

    @Test
    fun `proportions de l'écran gardées`() {
        val screens = listOf(1080 to 2400, 1080 to 2340, 720 to 1280, 480 to 800, 1200 to 1920, 1840 to 2208, 1080 to 4000, 320 to 480)
        for ((w, h) in screens) {
            val size = sizeFor(w, h)
            assertEquals("écran $w x $h", w.toDouble() / h, size.width.toDouble() / size.height, 0.01)
            assertTrue("écran $w x $h", size.width <= WidgetThumbnail.WIDTH)
        }
    }

    @Test
    fun `surface bornée même sur un écran très haut`() {
        val size = sizeFor(1080, 4000)
        assertTrue(size.width < WidgetThumbnail.WIDTH)
        assertTrue(size.width * size.height <= WidgetThumbnail.MAX_PIXELS)
        // Le côté le plus long n'est pas rogné pour autant : toute la surface permise est utilisée à peu de chose près.
        assertTrue(size.width * size.height > WidgetThumbnail.MAX_PIXELS * 0.95)
    }

    @Test
    fun `le bitmap relu en RGB_565 reste sous la limite d'environ 1 Mo des échanges binder`() {
        val binderLimitBytes = 1_000_000
        val screens = listOf(1080 to 2400, 1440 to 3200, 1080 to 4000, 720 to 3200, 1200 to 1920, 1840 to 2208, 480 to 800, 1 to 10_000, 100 to 100_000)
        for ((w, h) in screens) {
            val size = sizeFor(w, h)
            assertTrue("écran $w x $h : ${size.width} x ${size.height}", size.width * size.height * 2 <= binderLimitBytes)
        }
    }

    @Test
    fun `images minuscules ou très allongées, jamais de côté nul`() {
        assertEquals(WidgetThumbnail.Size(1, 1), sizeFor(1, 1))
        assertEquals(WidgetThumbnail.Size(360, 1), sizeFor(1000, 1))
        val tall = sizeFor(1, 1000)
        assertTrue(tall.width >= 1 && tall.height >= 1)
        val huge = sizeFor(10, 1_000_000)
        assertTrue(huge.width >= 1 && huge.height >= 1)
        assertTrue(huge.width * huge.height <= WidgetThumbnail.MAX_PIXELS)
    }

    @Test
    fun `dimensions vides refusées`() {
        assertThrows(IllegalArgumentException::class.java) { sizeFor(0, 2400) }
        assertThrows(IllegalArgumentException::class.java) { sizeFor(1080, 0) }
        assertThrows(IllegalArgumentException::class.java) { sizeFor(-1, -1) }
    }

    @Test
    fun `fichier trop grand relu sous-échantillonné, sous la surface permise`() {
        assertEquals(1, WidgetThumbnail.sampleSizeFor(360, 800))
        assertEquals(1, WidgetThumbnail.sampleSizeFor(500, 800))
        assertEquals(2, WidgetThumbnail.sampleSizeFor(720, 1600))
        assertEquals(4, WidgetThumbnail.sampleSizeFor(1080, 2400))
        // Fichier illisible : on laisse le décodeur dire non.
        assertEquals(1, WidgetThumbnail.sampleSizeFor(0, 0))
        for ((w, h) in listOf(720 to 1600, 1080 to 2400, 4000 to 8000, 100_000 to 100_000)) {
            val sample = WidgetThumbnail.sampleSizeFor(w, h)
            assertTrue("$w x $h", (w / sample).toLong() * (h / sample) <= WidgetThumbnail.MAX_PIXELS)
        }
    }

    @Test
    fun `seul un fond posé sur l'accueil change l'aperçu`() {
        assertTrue(WidgetThumbnail.appliesTo(WallpaperTarget.HOME))
        assertTrue(WidgetThumbnail.appliesTo(WallpaperTarget.BOTH))
        assertFalse(WidgetThumbnail.appliesTo(WallpaperTarget.LOCK))
    }

    @Test
    fun `miniature dans files, widget, current point jpg`() {
        val files = tmp.newFolder("files")
        assertEquals(File(File(files, "widget"), "current.jpg"), WidgetThumbnail.file(files))
        assertEquals("current.jpg", WidgetThumbnail.file(files).name)
    }
}
