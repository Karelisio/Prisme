package io.karelisio.prisme.wallpaper

import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ImageFormatsTest {
    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun `type reconnu à la signature du fichier`() {
        assertEquals("image/jpeg", ImageFormats.mimeOf(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte())))
        assertEquals("image/png", ImageFormats.mimeOf(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0)))
        assertEquals("image/webp", ImageFormats.mimeOf("RIFF\u0000\u0000\u0000\u0000WEBP".toByteArray(Charsets.US_ASCII)))
        assertEquals("image/jpeg", ImageFormats.mimeOf(byteArrayOf(1, 2)))
        val png = tmp.newFile("x").apply { writeBytes(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 9, 9, 9, 9, 9)) }
        assertEquals("image/png", ImageFormats.mimeOf(png))
        assertEquals("image/jpeg", ImageFormats.mimeOf(tmp.newFile("vide")))
    }

    @Test
    fun `extensions et noms de fichiers sûrs`() {
        assertEquals("png", ImageFormats.extensionOf("image/png"))
        assertEquals("webp", ImageFormats.extensionOf("image/webp"))
        assertEquals("jpg", ImageFormats.extensionOf("image/jpeg"))
        assertEquals("Prisme_unsplash_abc-1", ImageFormats.safeName("Prisme unsplash:abc-1"))
        assertEquals("Prisme", ImageFormats.safeName("../"))
        assertEquals(80, ImageFormats.safeName("a".repeat(200)).length)
    }

    @Test
    fun `noms uniques dans la galerie`() {
        val dir = tmp.newFolder("Prisme")
        assertEquals("fond.jpg", ImageFormats.uniqueFile(dir, "fond.jpg").name)
        dir.resolve("fond.jpg").writeText("x")
        assertEquals("fond (2).jpg", ImageFormats.uniqueFile(dir, "fond.jpg").name)
        dir.resolve("fond (2).jpg").writeText("x")
        assertEquals("fond (3).jpg", ImageFormats.uniqueFile(dir, "fond.jpg").name)
    }
}
