package io.karelisio.prisme.quote

import io.karelisio.prisme.system.DailyNotifier
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class QuoteRenewalTest {
    private val hour = 3_600_000L

    private fun at(year: Int, month: Int, day: Int, hour: Int, minute: Int): Calendar =
        Calendar.getInstance(TimeZone.getTimeZone("Europe/Paris")).apply {
            clear()
            set(year, month - 1, day, hour, minute)
        }

    private fun untilNext(now: Calendar) = DailyNotifier.millisUntil(QuoteRenewal.RENEW_HOUR, now)

    @Test
    fun `la phrase est renouvelee chaque matin a 6 h, heure locale`() {
        assertEquals(6, QuoteRenewal.RENEW_HOUR)
        assertEquals(60_000L, untilNext(at(2026, 10, 2, 5, 59)))
        assertEquals(24 * hour, untilNext(at(2026, 10, 2, 6, 0)))
        assertEquals(6 * hour + hour / 2, untilNext(at(2026, 10, 2, 23, 30)))
        assertEquals(hour * 3, untilNext(at(2026, 10, 2, 3, 0)))
    }

    @Test
    fun `changement d'heure, toujours 6 h au matin`() {
        // Passage à l'heure d'hiver (25 octobre 2026) : la nuit dure une heure de plus.
        assertEquals(25 * hour, untilNext(at(2026, 10, 24, 6, 0)))
        // Passage à l'heure d'été (29 mars 2026) : une heure de moins.
        assertEquals(23 * hour, untilNext(at(2026, 3, 28, 6, 0)))
    }
}
