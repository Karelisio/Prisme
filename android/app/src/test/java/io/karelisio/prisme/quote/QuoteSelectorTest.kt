package io.karelisio.prisme.quote

import io.karelisio.prisme.wallpaper.WallpaperTarget
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.GregorianCalendar

/** Les mêmes valeurs sont vérifiées côté app (selection.test.ts) : le fond d'écran et l'aperçu affichent la même phrase. */
class QuoteSelectorTest {
    private val today = QuoteSelector.dayNumber(2026, 10, 2)

    @Test
    fun `numero du jour depuis le 1er janvier 1970`() {
        assertEquals(0, QuoteSelector.dayNumber(1970, 1, 1))
        assertEquals(-1, QuoteSelector.dayNumber(1969, 12, 31))
        assertEquals(11017, QuoteSelector.dayNumber(2000, 3, 1))
        assertEquals(19782, QuoteSelector.dayNumber(2024, 2, 29))
        assertEquals(20728, today)
        assertEquals(20818, QuoteSelector.dayNumber(2026, 12, 31))
        assertEquals(20819, QuoteSelector.dayNumber(2027, 1, 1))
    }

    @Test
    fun `annees bissextiles`() {
        assertEquals(2, QuoteSelector.dayNumber(2024, 3, 1) - QuoteSelector.dayNumber(2024, 2, 28))
        assertEquals(1, QuoteSelector.dayNumber(2025, 3, 1) - QuoteSelector.dayNumber(2025, 2, 28))
        assertEquals(1, QuoteSelector.dayNumber(2100, 3, 1) - QuoteSelector.dayNumber(2100, 2, 28))
        assertEquals(2, QuoteSelector.dayNumber(2000, 3, 1) - QuoteSelector.dayNumber(2000, 2, 28))
    }

    @Test
    fun `le jour suit le calendrier local, heure comprise`() {
        val evening = GregorianCalendar(2026, Calendar.OCTOBER, 2, 23, 59, 59)
        val morning = GregorianCalendar(2026, Calendar.OCTOBER, 3, 0, 0, 1)
        assertEquals(20728, QuoteSelector.dayNumber(evening))
        assertEquals(20729, QuoteSelector.dayNumber(morning))
    }

    @Test
    fun `ordre de passage identique cote app`() {
        assertArrayEquals(intArrayOf(), QuoteSelector.passOrder(0))
        assertArrayEquals(intArrayOf(0), QuoteSelector.passOrder(1))
        assertArrayEquals(intArrayOf(0, 1), QuoteSelector.passOrder(2))
        assertArrayEquals(intArrayOf(1, 2, 0), QuoteSelector.passOrder(3))
        assertArrayEquals(intArrayOf(1, 3, 4, 5, 2, 0, 6), QuoteSelector.passOrder(7))
        assertArrayEquals(intArrayOf(0, 8, 9, 5, 3, 4, 6, 2, 1, 7), QuoteSelector.passOrder(10))
        assertArrayEquals(intArrayOf(82, 48, 89, 73, 58, 0, 33, 14, 11, 75, 52, 96), QuoteSelector.passOrder(100).copyOf(12))
    }

    @Test
    fun `chaque phrase une seule fois par ordre de passage`() {
        for (count in listOf(1, 2, 3, 5, 57, 108, 137, 500)) {
            assertEquals(List(count) { it }, QuoteSelector.passOrder(count).sorted())
        }
    }

    @Test
    fun `phrase du jour identique cote app`() {
        fun picks(count: Int) = (0..5).map { QuoteSelector.pickIndex(today, it, count) }
        assertEquals(listOf(2, 0, 1, 2, 0, 1), picks(3))
        assertEquals(listOf(1, 7, 0, 8, 9, 5), picks(10))
        assertEquals(listOf(95, 68, 31, 88, 77, 29), picks(100))
        assertEquals(listOf(85, 127, 82, 112, 36, 94), picks(137))
    }

    @Test
    fun `aucune phrase ne revient avant d'avoir parcouru toute la liste`() {
        for (count in listOf(2, 3, 4, 10, 57, 108, 137)) {
            for (start in 0 until count * 3 step 7) {
                val seen = (0 until count).map { QuoteSelector.pickIndex(today + start + it, 0, count) }.toSet()
                assertEquals("liste de $count, départ $start", count, seen.size)
            }
            for (i in 0 until count * 4) {
                assertNotEquals(QuoteSelector.pickIndex(today + i, 0, count), QuoteSelector.pickIndex(today + i + 1, 0, count))
            }
        }
    }

    @Test
    fun `une autre passe a la suivante, et demain ne la repete pas`() {
        val count = 108
        val order = QuoteSelector.passOrder(count)
        val position = today % count
        assertEquals(order[position], QuoteSelector.pickIndex(today, 0, count))
        assertEquals(order[(position + 1) % count], QuoteSelector.pickIndex(today, 1, count))
        assertEquals(order[(position + 2) % count], QuoteSelector.pickIndex(today + 1, 1, count))
    }

    @Test
    fun `liste vide ou cran negatif`() {
        assertEquals(-1, QuoteSelector.pickIndex(today, 0, 0))
        assertEquals(-1, QuoteSelector.pickIndex(today, 3, -2))
        assertEquals(QuoteSelector.pickIndex(today, 0, 10), QuoteSelector.pickIndex(today, -4, 10))
        assertEquals(0, QuoteSelector.pickIndex(today, 0, 1))
    }

    @Test
    fun `phrase du jour avec sa presentation`() {
        val quotes = List(10) { Quote("Phrase $it", if (it % 2 == 0) "Auteur $it" else null) }
        val style = QuoteStyle(QuoteFont.SANS, QuotePosition.TOP, QuoteSize.LARGE, QuoteColor.WHITE)
        val config = QuoteConfig(enabled = true, target = WallpaperTarget.BOTH, style = style, shift = 1, quotes = quotes)
        val calendar = GregorianCalendar(2026, Calendar.OCTOBER, 2, 6, 0)
        val spec = QuoteSelector.today(config, calendar)
        // Avec un cran d'avance : le deuxième rang de l'ordre de passage (voir `phrase du jour identique cote app`).
        assertEquals(quotes[7], spec?.quote)
        assertEquals(style, spec?.style)
        assertEquals(WallpaperTarget.BOTH, spec?.target)
        // Même jour, même phrase : le matin comme le soir.
        assertEquals(spec, QuoteSelector.today(config, GregorianCalendar(2026, Calendar.OCTOBER, 2, 23, 59)))
        assertNotEquals(spec, QuoteSelector.today(config, GregorianCalendar(2026, Calendar.OCTOBER, 3, 6, 0)))
    }

    @Test
    fun `rien a poser quand l'option est coupee ou la liste vide`() {
        val calendar = GregorianCalendar(2026, Calendar.OCTOBER, 2)
        assertNull(QuoteSelector.today(QuoteConfig(enabled = false, quotes = listOf(Quote("A"))), calendar))
        assertNull(QuoteSelector.today(QuoteConfig(enabled = true), calendar))
        assertTrue(QuoteSelector.today(QuoteConfig(enabled = true, quotes = listOf(Quote("A"))), calendar) != null)
    }
}
