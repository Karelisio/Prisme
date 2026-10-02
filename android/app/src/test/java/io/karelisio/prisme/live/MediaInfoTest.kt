package io.karelisio.prisme.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaInfoTest {
    private val video = MediaInfo("video.mp4", "Vacances d'été.mp4", 48_600_000, 15_000, 1080, 1920, 1_700_000_000_000)
    private val gif = MediaInfo("anim.gif", "chat.gif", 3_200_000, null, 480, 480, 1_700_000_000_123)

    @Test
    fun `enregistrement et relecture d'une vidéo`() {
        assertEquals(video, MediaInfo.fromJson(video.toJson()))
    }

    @Test
    fun `un GIF n'a pas de durée`() {
        val read = MediaInfo.fromJson(gif.toJson())
        assertEquals(gif, read)
        assertNull(read?.durationMs)
    }

    @Test
    fun `valeur absente, illisible ou dangereuse, pas de média`() {
        assertNull(MediaInfo.fromJson(null))
        assertNull(MediaInfo.fromJson(""))
        assertNull(MediaInfo.fromJson("pas du JSON"))
        assertNull(MediaInfo.fromJson("{}"))
        // Le nom du fichier est cherché dans files/live/media : jamais un chemin.
        assertNull(MediaInfo.fromJson("""{"file":"../shared_prefs/prisme_live.xml","name":"x"}"""))
        assertNull(MediaInfo.fromJson("""{"file":"/data/data/io.karelisio.prisme/files/x.mp4"}"""))
        assertNull(MediaInfo.fromJson("""{"file":"sous\\dossier.mp4"}"""))
        assertNull(MediaInfo.fromJson("""{"file":".cache"}"""))
    }

    @Test
    fun `sans nom d'origine, le nom du fichier est affiché`() {
        val read = MediaInfo.fromJson("""{"file":"anim.webp","sizeBytes":10,"width":2,"height":3,"stamp":5}""")
        assertEquals("anim.webp", read?.name)
        assertEquals(MediaInfo("anim.webp", "anim.webp", 10, null, 2, 3, 5), read)
    }

    @Test
    fun `noms de fichier simples seulement`() {
        assertTrue(MediaInfo.isSimpleName("video.mp4"))
        assertFalse(MediaInfo.isSimpleName(""))
        assertFalse(MediaInfo.isSimpleName("   "))
        assertFalse(MediaInfo.isSimpleName("a/b"))
        assertFalse(MediaInfo.isSimpleName("a\\b"))
        assertFalse(MediaInfo.isSimpleName(".."))
    }

    @Test
    fun `les médias ne s'écrivent jamais dans les réglages d'une scène`() {
        // L'app réécrit en entier scene_<genre> à chaque réglage : ce que le natif y rangerait serait perdu.
        val sceneKeys = LiveMode.entries.map { LiveWallpaperStore.sceneKey(it) }
        for (kind in MediaKind.entries) {
            val key = LiveWallpaperStore.mediaKey(kind)
            assertFalse("$key est une clé de réglages de scène", key in sceneKeys)
            assertFalse(key.startsWith("scene_"))
        }
        assertNotEquals(LiveWallpaperStore.mediaKey(MediaKind.VIDEO), LiveWallpaperStore.mediaKey(MediaKind.GIF))
    }
}
