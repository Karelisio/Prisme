package io.karelisio.prisme.wallpaper

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class WallpaperUtilsTest {
    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun `cibles et drapeaux WallpaperManager`() {
        assertEquals(1, WallpaperTarget.HOME.flags)
        assertEquals(2, WallpaperTarget.LOCK.flags)
        assertEquals(3, WallpaperTarget.BOTH.flags)
        assertEquals(WallpaperTarget.LOCK, WallpaperTarget.fromKey("lock"))
        assertNull(WallpaperTarget.fromKey("plafond"))
    }

    @Test
    fun `couleurs au format hexadécimal`() {
        assertEquals("#FF8800", ColorFormat.hex(0xFFFF8800.toInt()))
        assertEquals("#000000", ColorFormat.hex(0xFF000000.toInt()))
        assertEquals("surfaceContainerHighest", ColorFormat.camelCase("surface_container_highest"))
        assertEquals("primary", ColorFormat.camelCase("primary"))
    }

    @Test
    fun `clés de cache stables et distinctes`() {
        val a = CacheKeys.of("https://images.unsplash.com/photo-1?w=400")
        assertEquals(a, CacheKeys.of("https://images.unsplash.com/photo-1?w=400"))
        assertNotEquals(a, CacheKeys.of("https://images.unsplash.com/photo-1?w=401"))
        assertEquals(40, a.length)
    }

    @Test
    fun `purge du cache par ancienneté`() {
        val dir = tmp.newFolder("cache")
        val files = (0 until 5).map { i ->
            dir.resolve("f$i").apply {
                writeBytes(ByteArray(100))
                setLastModified(1_000_000L + i * 1000)
            }
        }
        CacheTrimmer.trim(dir, 250)
        assertFalse(files[0].exists())
        assertFalse(files[1].exists())
        assertFalse(files[2].exists())
        assertTrue(files[3].exists())
        assertTrue(files[4].exists())
        assertEquals(200, CacheTrimmer.sizeOf(dir))
    }

    @Test
    fun `URL locales Capacitor vers chemins de fichiers`() {
        assertEquals(
            "/data/user/0/io.karelisio.prisme/files/imports/a b.jpg",
            LocalUrls.toFilePath("https://localhost/_capacitor_file_/data/user/0/io.karelisio.prisme/files/imports/a%20b.jpg"),
        )
        assertEquals("/x/a+b.jpg", LocalUrls.toFilePath("http://localhost:8080/_capacitor_file_/x/a+b.jpg"))
        assertNull(LocalUrls.toFilePath("https://images.unsplash.com/_capacitor_file_/x.jpg"))
        assertNull(LocalUrls.toFilePath("https://localhost/assets/x.jpg"))
    }

    @Test
    fun `analyse des données base64`() {
        assertEquals(DataUrl.Parsed("png", "AAAA"), DataUrl.parse("data:image/png;base64,AAAA"))
        assertEquals(DataUrl.Parsed("jpg", "BBBB"), DataUrl.parse("data:image/jpeg;base64,BBBB"))
        assertEquals(DataUrl.Parsed("jpg", "CCCC"), DataUrl.parse("CCCC"))
        assertEquals("mon_fond_", DataUrl.safeName("mon fond!"))
        assertEquals(36, DataUrl.safeName(null).length)
    }

    @Test
    fun `références d'images en JSON`() {
        val ref = WallpaperRef("unsplash:1", "https://x/1.jpg", NormalizedRect(0.1, 0.2, 0.3, 0.4))
        assertEquals(ref, WallpaperRef.fromJson(JSONObject(ref.toJson().toString())))
        assertEquals(WallpaperRef("https://x", "https://x"), WallpaperRef.fromJson(JSONObject("""{"uri":"https://x"}""")))
        assertNull(WallpaperRef.fromJson(JSONObject("""{"id":"a"}""")))
        assertNull(WallpaperRef.cropFromJson(JSONObject("""{"x":0.1}""")))
    }
}
