package io.karelisio.prisme.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class UnlockPlaylistTest {
    @Test
    fun `image suivante au hasard sans reprendre l'actuelle`() {
        val seen = mutableSetOf<Int>()
        for (seed in 0 until 300) {
            val next = UnlockPlaylist.nextIndex(4, 2, Random(seed))
            assertNotEquals(2, next)
            assertTrue(next in 0..3)
            seen += next
        }
        // Toutes les autres images peuvent sortir.
        assertEquals(setOf(0, 1, 3), seen)
    }

    @Test
    fun `première ou dernière image de la liste ne sont pas reprises non plus`() {
        repeat(100) { seed ->
            assertNotEquals(0, UnlockPlaylist.nextIndex(3, 0, Random(seed)))
            assertNotEquals(2, UnlockPlaylist.nextIndex(3, 2, Random(seed)))
        }
    }

    @Test
    fun `image affichée inconnue, tirage dans toute la liste`() {
        // -1 : l'image choisie dans l'app est affichée, aucune de la liste n'est à éviter.
        val seen = (0 until 200).map { UnlockPlaylist.nextIndex(3, -1, Random(it)) }.toSet()
        assertEquals(setOf(0, 1, 2), seen)
        assertTrue(UnlockPlaylist.nextIndex(3, 9, Random(1)) in 0..2)
    }

    @Test
    fun `liste d'une image ou vide`() {
        assertEquals(0, UnlockPlaylist.nextIndex(1, 0, Random(1)))
        assertEquals(0, UnlockPlaylist.nextIndex(1, -1, Random(1)))
        assertEquals(-1, UnlockPlaylist.nextIndex(0, -1, Random(1)))
    }

    @Test
    fun `le compteur change l'image quand la fréquence est atteinte puis repart de zéro`() {
        var tick = UnlockPlaylist.Tick(0, false)
        val changes = mutableListOf<Boolean>()
        repeat(7) {
            tick = UnlockPlaylist.tick(tick.counter, 3)
            changes += tick.change
        }
        assertEquals(listOf(false, false, true, false, false, true, false), changes)
        assertEquals(UnlockPlaylist.Tick(1, false), tick)
    }

    @Test
    fun `chaque fois, l'image change à tous les déverrouillages`() {
        repeat(5) { assertEquals(UnlockPlaylist.Tick(0, true), UnlockPlaylist.tick(0, 1)) }
        // Fréquence invalide : traitée comme « chaque fois ».
        assertEquals(UnlockPlaylist.Tick(0, true), UnlockPlaylist.tick(0, 0))
        assertEquals(UnlockPlaylist.Tick(0, true), UnlockPlaylist.tick(0, -4))
    }

    @Test
    fun `fréquence abaissée en cours de route, le prochain déverrouillage change l'image`() {
        // Sept déverrouillages comptés pour une fréquence de 10, puis l'utilisateur choisit 3.
        assertEquals(UnlockPlaylist.Tick(0, true), UnlockPlaylist.tick(7, 3))
        assertEquals(UnlockPlaylist.Tick(8, false), UnlockPlaylist.tick(7, 10))
        // Compteur abîmé : on repart de zéro.
        assertEquals(UnlockPlaylist.Tick(1, false), UnlockPlaylist.tick(-5, 3))
    }

    @Test
    fun `série de déverrouillages, une nouvelle image tous les 3 sans jamais reprendre celle affichée`() {
        val random = Random(7)
        var counter = 0
        var index = -1
        var changes = 0
        repeat(30) { unlock ->
            val step = UnlockPlaylist.step(counter, 3, 4, index, random)
            counter = step.counter
            val next = step.nextIndex
            // L'image change au 3e, 6e, 9e… déverrouillage, et seulement alors.
            assertEquals((unlock + 1) % 3 == 0, next != null)
            if (next != null) {
                assertNotEquals(index, next)
                assertEquals(0, counter)
                index = next
                changes++
            }
        }
        assertEquals(10, changes)
    }

    @Test
    fun `chaque fois, chaque déverrouillage donne une autre image`() {
        val random = Random(3)
        var index = 0
        repeat(40) {
            val next = UnlockPlaylist.step(0, 1, 2, index, random).nextIndex
            // Deux images : elles alternent forcément.
            assertEquals(1 - index, next)
            index = next ?: index
        }
    }

    @Test
    fun `fréquence bornée`() {
        assertEquals(1, UnlockPlaylist.clampEvery(0))
        assertEquals(5, UnlockPlaylist.clampEvery(5))
        assertEquals(UnlockPlaylist.MAX_EVERY, UnlockPlaylist.clampEvery(100_000))
    }

    @Test
    fun `l'image affichée est retrouvée par son chemin quand la liste change`() {
        val old = listOf("/a", "/b", "/c")
        assertEquals(0, UnlockPlaylist.remapIndex(old, 1, listOf("/b", "/x")))
        assertEquals(2, UnlockPlaylist.remapIndex(old, 1, listOf("/a", "/x", "/b")))
        // Retirée de la liste, ou image choisie dans l'app (-1) : plus aucune image de la liste affichée.
        assertEquals(-1, UnlockPlaylist.remapIndex(old, 1, listOf("/a", "/c")))
        assertEquals(-1, UnlockPlaylist.remapIndex(old, -1, old))
        assertEquals(-1, UnlockPlaylist.remapIndex(old, 7, old))
    }

    @Test
    fun `un même déverrouillage annoncé par deux moteurs n'est compté qu'une fois`() {
        assertTrue(UnlockPlaylist.isDuplicate(10_300, 10_000))
        assertFalse(UnlockPlaylist.isDuplicate(10_000 + UnlockPlaylist.DEBOUNCE_MS, 10_000))
        assertFalse(UnlockPlaylist.isDuplicate(60_000, 10_000))
        // Rien de compté jusque-là.
        assertFalse(UnlockPlaylist.isDuplicate(500, -UnlockPlaylist.DEBOUNCE_MS))
    }

    @Test
    fun `fondu enchaîné progressif de transparent à opaque`() {
        assertEquals(0, UnlockPlaylist.fadeAlpha(0))
        assertEquals(255, UnlockPlaylist.fadeAlpha(UnlockPlaylist.FADE_MS))
        assertEquals(255, UnlockPlaylist.fadeAlpha(UnlockPlaylist.FADE_MS * 3))
        assertEquals(0, UnlockPlaylist.fadeAlpha(-20))
        assertEquals(128, UnlockPlaylist.fadeAlpha(UnlockPlaylist.FADE_MS / 2))
        var previous = -1
        for (ms in 0..UnlockPlaylist.FADE_MS step 16) {
            val alpha = UnlockPlaylist.fadeAlpha(ms)
            assertTrue(alpha >= previous)
            previous = alpha
        }
    }

    @Test
    fun `liste de chemins enregistrée puis relue, valeur abîmée ignorée`() {
        val paths = listOf("/data/user/0/io.karelisio.prisme/files/live-playlist/ab12.jpg", "/chemin avec \"guillemets\" et é.jpg")
        assertEquals(paths, UnlockPlaylist.decodePaths(UnlockPlaylist.encodePaths(paths)))
        assertEquals(emptyList<String>(), UnlockPlaylist.decodePaths(UnlockPlaylist.encodePaths(emptyList())))
        assertEquals(emptyList<String>(), UnlockPlaylist.decodePaths(null))
        assertEquals(emptyList<String>(), UnlockPlaylist.decodePaths(""))
        assertEquals(emptyList<String>(), UnlockPlaylist.decodePaths("pas du json"))
        assertEquals(listOf("/a"), UnlockPlaylist.decodePaths("""["/a","",null,3]"""))
    }
}
