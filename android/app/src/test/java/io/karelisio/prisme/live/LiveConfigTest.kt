package io.karelisio.prisme.live

import io.karelisio.prisme.live.LiveWallpaperStore.Config
import io.karelisio.prisme.live.LiveWallpaperStore.Playlist
import io.karelisio.prisme.wallpaper.WallpaperRef
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveConfigTest {
    private val base = "/files/live/live-1.jpg"
    private val paths = listOf("/files/live-playlist/a.jpg", "/files/live-playlist/b.jpg", "/files/live-playlist/c.jpg")

    @Test
    fun `sans liste active, l'image choisie dans l'app reste affichée`() {
        assertEquals(base, Config(base, 0.5f).shownPath)
        // Liste coupée, ou une seule image prête : le changement ne peut pas avoir lieu.
        assertEquals(base, Config(base, 0.5f, Playlist(enabled = false, paths = paths, index = 1)).shownPath)
        assertEquals(base, Config(base, 0.5f, Playlist(enabled = true, paths = paths.take(1), index = 0)).shownPath)
        assertNull(Config(null, 0.5f).shownPath)
    }

    @Test
    fun `avec une liste active, l'image de la liste est affichée, l'image choisie avant le premier changement`() {
        val active = Playlist(enabled = true, paths = paths, every = 3)
        assertTrue(active.active)
        assertEquals(base, Config(base, 0.5f, active).shownPath)
        assertEquals(paths[2], Config(base, 0.5f, active.copy(index = 2)).shownPath)
        // Position hors de la liste (liste raccourcie) : retour à l'image choisie.
        assertEquals(base, Config(base, 0.5f, active.copy(index = 7)).shownPath)
    }

    @Test
    fun `la liste n'est active qu'avec deux images prêtes`() {
        assertFalse(Playlist().active)
        assertFalse(Playlist(enabled = true, paths = paths.take(1)).active)
        assertTrue(Playlist(enabled = true, paths = paths.take(2)).active)
        assertFalse(Playlist(enabled = false, paths = paths).active)
    }

    @Test
    fun `images de la liste sans doublon et en nombre borné`() {
        val refs = (0 until UnlockPlaylist.MAX_ITEMS + 10).map { WallpaperRef("w$it", "https://x/$it.jpg") }
        val selected = UnlockPlaylist.select(refs + WallpaperRef("w3", "https://x/autre.jpg"))
        assertEquals(UnlockPlaylist.MAX_ITEMS, selected.size)
        assertEquals("w0", selected.first().id)
        assertEquals("https://x/3.jpg", selected[3].uri)
        assertEquals(selected.map { it.id }.distinct(), selected.map { it.id })
        assertEquals(emptyList<WallpaperRef>(), UnlockPlaylist.select(emptyList()))
    }
}
