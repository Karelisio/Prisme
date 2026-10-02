package io.karelisio.prisme.automation

import io.karelisio.prisme.wallpaper.WallpaperRef
import io.karelisio.prisme.wallpaper.WallpaperTarget
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class Lot3EngineTest {
    private val paris = GeoPoint(48.8566, 2.3522)

    private fun ref(id: String) = WallpaperRef(id, "https://x/$id.jpg")

    private fun near(expected: Int, actual: Int?, tolerance: Int = 6) {
        assertNotNull(actual)
        assertTrue("attendu ≈ $expected, obtenu $actual", abs(expected - actual!!) <= tolerance)
    }

    @Test
    fun `lever et coucher du soleil à Paris aux solstices`() {
        // 21 juin : lever ≈ 5 h 47, coucher ≈ 21 h 58 (heure d'été, UTC+2).
        val summer = SunTimes.compute(paris, 172, 120)
        near(5 * 60 + 47, summer?.sunrise)
        near(21 * 60 + 58, summer?.sunset)
        // 21 décembre : lever ≈ 8 h 42, coucher ≈ 16 h 56 (UTC+1).
        val winter = SunTimes.compute(paris, 355, 60)
        near(8 * 60 + 42, winter?.sunrise)
        near(16 * 60 + 56, winter?.sunset)
        // Nuit polaire à Tromsø en décembre.
        assertNull(SunTimes.compute(GeoPoint(69.65, 18.96), 355, 60))
        assertTrue(SunTimes.isNight(winter, 18 * 60))
        assertTrue(SunTimes.isNight(null, 23 * 60))
    }

    @Test
    fun `créneaux calés sur le soleil, heures fixes sans lieu`() {
        val mode = DynamicMode.Time(
            slots = listOf(
                TimeSlot(6 * 60, ref("matin"), SunAnchor.SUNRISE, -30),
                TimeSlot(22 * 60, ref("nuit"), SunAnchor.SUNSET, 40),
            ),
            sun = paris,
        )
        val winterEvening = Moment(0, 1, 18 * 60, 12, dayOfMonth = 21, dayOfYear = 355, utcOffsetMinutes = 60)
        val resolved = mode.resolved(winterEvening)
        near(8 * 60 + 12, resolved.slots[0].startMinute)
        near(17 * 60 + 36, resolved.slots[1].startMinute)
        // À 18 h en hiver, il fait nuit : le créneau « nuit » est déjà commencé.
        val config = AutomationConfig(dynamic = DynamicConfig(enabled = true, mode = mode))
        val decision = RulesEngine.decide(config, Environment(winterEvening), AutomationState(), { null })
        assertEquals("nuit", decision.home?.id)
        assertEquals(mode.slots, mode.copy(sun = null).resolved(winterEvening).slots)
    }

    @Test
    fun `mode sombre du système`() {
        val config = AutomationConfig(dynamic = DynamicConfig(enabled = true, mode = DynamicMode.Theme(ref("clair"), ref("sombre"))))
        val moment = Moment(0, 1, 600, 10)
        assertEquals("sombre", RulesEngine.decide(config, Environment(moment, darkMode = true), AutomationState(), { null }).home?.id)
        assertEquals("clair", RulesEngine.decide(config, Environment(moment, darkMode = false), AutomationState(), { null }).home?.id)
        // Mode inconnu : rien ne change.
        assertEquals(Reason.NONE, RulesEngine.decide(config, Environment(moment), AutomationState(), { null }).reason)
        val parsed = AutomationConfig.fromJson(
            JSONObject("""{"dynamic":{"enabled":true,"mode":"theme","theme":{"dark":{"id":"s","uri":"https://x/s.jpg"}}}}"""),
        )
        assertEquals(DynamicMode.Theme(null, WallpaperRef("s", "https://x/s.jpg")), parsed.dynamic.mode)
    }

    @Test
    fun `fêtes et dates perso du jour`() {
        val json = JSONObject(
            """{"events":{"enabled":true,"target":"lock","items":[
              {"id":"anniv","name":"Anniversaire","dates":["2026-03-14"],"item":{"id":"gateau","uri":"https://x/g.jpg"}},
              {"id":"noel","name":"Noël","dates":["2026-12-24","2026-12-25"],"queries":[{"provider":"wallhaven","query":"christmas"}]},
              {"id":"vide","name":"Sans fond","dates":["2026-12-25"]}]}}""",
        )
        val events = AutomationConfig.fromJson(json).events
        assertEquals(listOf("anniv", "noel"), events.items.map { it.id })
        assertEquals(WallpaperTarget.LOCK, events.target)
        val christmas = Moment(0, 5, 600, 12, dayOfMonth = 25, year = 2026)
        assertEquals("2026-12-25", EventsRule.today(christmas))
        assertEquals("noel", EventsRule.active(events, christmas)?.id)
        assertEquals("anniv", EventsRule.active(events, Moment(0, 6, 600, 3, dayOfMonth = 14, year = 2026))?.id)
        assertNull(EventsRule.active(events, Moment(0, 6, 600, 3, dayOfMonth = 15, year = 2026)))
        assertNull(EventsRule.active(events.copy(enabled = false), christmas))
    }

    @Test
    fun `assombrissement progressif après le coucher, effacé avant le lever`() {
        val config = DimConfig(enabled = true, max = 0.4f)
        fun at(hour: Int, minute: Int = 0) = EveningDim.level(config, Moment(0, 1, hour * 60 + minute, 10))
        // Sans lieu : coucher 21 h, lever 7 h.
        assertEquals(0f, at(15), 0.001f)
        assertEquals(0f, at(21), 0.001f)
        assertEquals(0.2f, at(21, 45), 0.001f)
        assertEquals(0.4f, at(23), 0.001f)
        assertEquals(0.4f, at(3), 0.001f)
        assertEquals(0.2f, at(6, 30), 0.001f)
        assertEquals(0f, at(7), 0.001f)
        assertEquals(0f, EveningDim.level(config.copy(enabled = false), Moment(0, 1, 23 * 60, 10)), 0.001f)
        val parsed = AutomationConfig.fromJson(JSONObject("{\"dim\":{\"enabled\":true,\"max\":0.55,\"sun\":{\"latitude\":48.85,\"longitude\":2.35}}}"))
        assertEquals(DimConfig(true, 0.55f, GeoPoint(48.85, 2.35)), parsed.dim)
        assertTrue(parsed.anyEnabled)
    }

    @Test
    fun `rotation intelligente, tout passe une fois, teintes variées, sombre la nuit`() {
        val items = listOf(
            WallpaperRef("bleu1", "u1", color = "#1e60c0"),
            WallpaperRef("bleu2", "u2", color = "#2a6fd0"),
            WallpaperRef("rouge", "u3", color = "#c62828"),
            WallpaperRef("nuit", "u4", color = "#0a0a0a"),
        )
        val random = kotlin.random.Random(3)
        var index = 0
        var seen = listOf("bleu1")
        val shown = mutableListOf("bleu1")
        repeat(3) {
            val (next, cycle) = SmartRotation.next(items, index, seen.toSet(), night = false, random = random)
            assertTrue(items[next].id !in shown)
            shown += items[next].id
            index = next
            seen = cycle
        }
        assertEquals(4, shown.toSet().size)
        // Cycle terminé : on repart, sans reprendre le fond actuel.
        val (afterCycle, newCycle) = SmartRotation.next(items, index, seen.toSet(), night = false, random = random)
        assertTrue(afterCycle != index)
        assertEquals(1, newCycle.size)
        // Teinte différente de l'actuel (bleu) quand c'est possible.
        val (fromBlue, _) = SmartRotation.next(items, 0, setOf("bleu1"), night = false, random = random)
        assertTrue(items[fromBlue].id != "bleu2")
        // La nuit, le fond sombre passe en priorité.
        assertEquals("nuit", items[SmartRotation.next(items, 0, setOf("bleu1"), night = true, random = random).first].id)
        assertEquals("dark", SmartRotation.hueClass("#0a0a0a"))
        assertEquals(null, SmartRotation.hueClass("#808080"))
    }
}
