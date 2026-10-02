package io.karelisio.prisme.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaRulesTest {
    private val mo = 1024L * 1024L

    private fun bytes(text: String) = ByteArray(text.length) { text[it].code.toByte() }

    @Test
    fun `limites de taille de chaque genre`() {
        assertEquals(300 * mo, MediaKind.VIDEO.maxBytes)
        assertEquals(50 * mo, MediaKind.GIF.maxBytes)
        // La limite elle-même est acceptée, un octet de plus non.
        assertFalse(MediaRules.isTooLarge(MediaKind.VIDEO, 300 * mo))
        assertTrue(MediaRules.isTooLarge(MediaKind.VIDEO, 300 * mo + 1))
        assertFalse(MediaRules.isTooLarge(MediaKind.GIF, 50 * mo))
        assertTrue(MediaRules.isTooLarge(MediaKind.GIF, 80 * mo))
        assertFalse(MediaRules.isTooLarge(MediaKind.GIF, 0))
    }

    @Test
    fun `message d'un fichier trop lourd`() {
        assertEquals("Cette vidéo pèse 412 Mo : la limite est de 300 Mo.", MediaRules.tooLargeMessage(MediaKind.VIDEO, 412 * mo))
        assertEquals("Ce GIF pèse 80 Mo : la limite est de 50 Mo.", MediaRules.tooLargeMessage(MediaKind.GIF, 80 * mo))
        // Arrondi au-dessus : un fichier refusé n'affiche jamais la valeur de la limite.
        assertEquals("Cette vidéo pèse 301 Mo : la limite est de 300 Mo.", MediaRules.tooLargeMessage(MediaKind.VIDEO, 300 * mo + 1))
        // Taille inconnue (copie coupée à la limite) : seule la limite est donnée.
        assertEquals("Cette vidéo dépasse la limite de 300 Mo.", MediaRules.tooLargeMessage(MediaKind.VIDEO, null))
        assertEquals("Ce GIF dépasse la limite de 50 Mo.", MediaRules.tooLargeMessage(MediaKind.GIF, null))
    }

    @Test
    fun `genre de média retrouvé par sa clé`() {
        assertEquals(MediaKind.VIDEO, MediaKind.fromKey("video"))
        assertEquals(MediaKind.GIF, MediaKind.fromKey("gif"))
        assertNull(MediaKind.fromKey("image"))
        assertNull(MediaKind.fromKey(null))
        // Chaque genre garde son propre fichier.
        assertEquals(MediaKind.entries.size, MediaKind.entries.map { it.filePrefix }.toSet().size)
    }

    @Test
    fun `le sélecteur propose le WebP animé seulement dès Android 9`() {
        assertEquals(listOf("video/*"), MediaRules.pickerTypes(MediaKind.VIDEO, 24))
        assertEquals(listOf("video/*"), MediaRules.pickerTypes(MediaKind.VIDEO, 36))
        assertEquals(listOf("image/gif"), MediaRules.pickerTypes(MediaKind.GIF, 24))
        assertEquals(listOf("image/gif"), MediaRules.pickerTypes(MediaKind.GIF, 27))
        assertEquals(listOf("image/gif", "image/webp"), MediaRules.pickerTypes(MediaKind.GIF, 28))
        assertEquals(listOf("image/gif", "image/webp"), MediaRules.pickerTypes(MediaKind.GIF, 36))
    }

    @Test
    fun `format d'une image animée reconnu à ses premiers octets`() {
        assertEquals("gif", MediaRules.imageExtension(bytes("GIF89a") + byteArrayOf(1, 0, 1, 0)))
        assertEquals("gif", MediaRules.imageExtension(bytes("GIF87a")))
        assertEquals("webp", MediaRules.imageExtension(bytes("RIFF") + byteArrayOf(0x24, 0, 0, 0) + bytes("WEBPVP8X")))
        // Autres formats, fichier tronqué ou vide : pas une image animée.
        assertNull(MediaRules.imageExtension(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)))
        assertNull(MediaRules.imageExtension(bytes("RIFF") + byteArrayOf(0x24, 0, 0, 0) + bytes("WAVEfmt ")))
        assertNull(MediaRules.imageExtension(bytes("GIF8")))
        assertNull(MediaRules.imageExtension(bytes("RIFF")))
        assertNull(MediaRules.imageExtension(ByteArray(0)))
    }

    @Test
    fun `extension du fichier d'une vidéo`() {
        assertEquals("mp4", MediaRules.videoExtension("video/mp4", "Vacances.MOV"))
        assertEquals("webm", MediaRules.videoExtension("video/webm", null))
        assertEquals("mkv", MediaRules.videoExtension("video/x-matroska", null))
        assertEquals("3gp", MediaRules.videoExtension("VIDEO/3GPP", null))
        assertEquals("mov", MediaRules.videoExtension("video/quicktime", null))
        // Type inconnu : l'extension du nom d'origine, si elle est plausible ; sinon mp4.
        assertEquals("avi", MediaRules.videoExtension("video/x-msvideo", "film.AVI"))
        assertEquals("mp4", MediaRules.videoExtension(null, "sans extension"))
        assertEquals("mp4", MediaRules.videoExtension(null, "archive.tar.gz.très-long"))
        assertEquals("mp4", MediaRules.videoExtension(null, "bizarre.a/b"))
        // Jamais le suffixe des copies en cours.
        assertEquals("mp4", MediaRules.videoExtension(null, "film.part"))
        assertEquals("mp4", MediaRules.videoExtension("application/octet-stream", "film.PART"))
        assertEquals("mp4", MediaRules.videoExtension(null, null))
    }

    @Test
    fun `taille affichée d'une vidéo tournée d'un quart de tour`() {
        assertEquals(1920 to 1080, MediaRules.displaySize(1920, 1080, 0))
        assertEquals(1080 to 1920, MediaRules.displaySize(1920, 1080, 90))
        assertEquals(1920 to 1080, MediaRules.displaySize(1920, 1080, 180))
        assertEquals(1080 to 1920, MediaRules.displaySize(1920, 1080, 270))
        assertEquals(1080 to 1920, MediaRules.displaySize(1920, 1080, -90))
        assertEquals(1080 to 1920, MediaRules.displaySize(1920, 1080, 450))
    }

    @Test
    fun `l'ancien fichier du genre est supprimé, jamais celui de l'autre genre`() {
        val files = listOf("video.mp4", "video.webm", "video.part", "anim.gif", "anim.webp", "autre.txt")
        // Nouvelle vidéo en webm : l'ancien mp4 et le reste de copie partent, le GIF reste.
        assertEquals(listOf("video.mp4", "video.part"), MediaRules.staleFiles(files, MediaKind.VIDEO, "video.webm"))
        // Même nom que l'ancien (remplacé sur place) : rien à supprimer pour ce fichier.
        assertEquals(listOf("anim.webp"), MediaRules.staleFiles(files, MediaKind.GIF, "anim.gif"))
        assertEquals(emptyList<String>(), MediaRules.staleFiles(listOf("video.mp4"), MediaKind.VIDEO, "video.mp4"))
        assertEquals(emptyList<String>(), MediaRules.staleFiles(emptyList(), MediaKind.GIF, "anim.gif"))
    }

    @Test
    fun `nom affiché d'un média`() {
        assertEquals("Vacances.mp4", MediaRules.displayName("  Vacances.mp4 ", MediaKind.VIDEO))
        assertEquals("Vidéo", MediaRules.displayName(null, MediaKind.VIDEO))
        assertEquals("GIF", MediaRules.displayName("   ", MediaKind.GIF))
    }
}
