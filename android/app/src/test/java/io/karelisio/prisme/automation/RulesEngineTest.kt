package io.karelisio.prisme.automation

import io.karelisio.prisme.wallpaper.WallpaperRef
import io.karelisio.prisme.wallpaper.WallpaperTarget
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import kotlin.random.Random

class RulesEngineTest {
    private fun ref(id: String) = WallpaperRef(id, "https://x/$id.jpg")

    /** Lundi 6 octobre 2025 à hh:mm (jour 1). */
    private fun at(hour: Int, minute: Int = 0, day: Int = 1, month: Int = 10) =
        Moment(epochMillis = (day * 24L * 60 + hour * 60 + minute) * 60_000L, dayOfWeek = day, minuteOfDay = hour * 60 + minute, month = month)

    private val noManual: (WallpaperTarget) -> WallpaperRef? = { null }

    private val workFocus = FocusConfig(
        enabled = true,
        target = WallpaperTarget.BOTH,
        ref = ref("focus"),
        schedules = listOf(FocusSchedule(setOf(1, 2, 3, 4, 5), 9 * 60, 12 * 60)),
    )

    @Test
    fun `le mode focus s'applique dans sa plage et prime sur le reste`() {
        val config = AutomationConfig(
            rotation = RotationConfig(enabled = true, items = listOf(ref("a"), ref("b"))),
            focus = workFocus,
        )
        val decision = RulesEngine.decide(config, Environment(at(10)), AutomationState(), noManual)
        assertEquals(Reason.FOCUS, decision.reason)
        assertEquals("focus", decision.home?.id)
        assertEquals("focus", decision.lock?.id)
        assertTrue(decision.state.focusApplied)
    }

    @Test
    fun `plages focus, jours, bornes et nuit à cheval`() {
        val work = workFocus.schedules[0]
        assertTrue(RulesEngine.inSchedule(work, at(9, 0)))
        assertFalse(RulesEngine.inSchedule(work, at(12, 0)))
        assertFalse(RulesEngine.inSchedule(work, at(10, 0, day = 6)))
        val night = FocusSchedule(setOf(7), 22 * 60, 7 * 60)
        assertTrue(RulesEngine.inSchedule(night, at(23, 0, day = 7)))
        assertTrue(RulesEngine.inSchedule(night, at(6, 59, day = 1)))
        assertFalse(RulesEngine.inSchedule(night, at(7, 0, day = 1)))
        assertFalse(RulesEngine.inSchedule(night, at(23, 0, day = 1)))
    }

    @Test
    fun `à la fin du focus, on restaure le fond choisi à la main`() {
        val config = AutomationConfig(focus = workFocus)
        val manual = mapOf(WallpaperTarget.HOME to ref("maison"), WallpaperTarget.LOCK to ref("verrou"))
        val decision = RulesEngine.decide(config, Environment(at(13)), AutomationState(focusApplied = true), { manual[it] })
        assertEquals(Reason.RESTORE, decision.reason)
        assertEquals("maison", decision.home?.id)
        assertEquals("verrou", decision.lock?.id)
        assertFalse(decision.state.focusApplied)
        assertEquals(Reason.NONE, RulesEngine.decide(config, Environment(at(13)), decision.state, { manual[it] }).reason)
    }

    @Test
    fun `fond selon l'heure, créneau en cours ou celui de la veille`() {
        val slots = listOf(TimeSlot(6 * 60, ref("matin")), TimeSlot(18 * 60, ref("soir")), TimeSlot(22 * 60, ref("nuit")))
        assertEquals("matin", RulesEngine.timeSlotRef(slots, 7 * 60)?.id)
        assertEquals("soir", RulesEngine.timeSlotRef(slots, 18 * 60)?.id)
        assertEquals("nuit", RulesEngine.timeSlotRef(slots, 3 * 60)?.id)
        assertNull(RulesEngine.timeSlotRef(emptyList(), 0))
    }

    @Test
    fun `saisons des deux hémisphères`() {
        assertEquals(Season.SPRING, RulesEngine.season(4, southern = false))
        assertEquals(Season.WINTER, RulesEngine.season(12, southern = false))
        assertEquals(Season.WINTER, RulesEngine.season(7, southern = true))
        assertEquals(Season.SPRING, RulesEngine.season(10, southern = true))
    }

    @Test
    fun `fond selon la batterie et la recharge`() {
        val mode = DynamicMode.Battery(
            levels = listOf(BatteryLevel(50, 101, ref("plein")), BatteryLevel(20, 50, ref("moyen")), BatteryLevel(0, 20, ref("faible"))),
            charging = ref("charge"),
        )
        assertEquals("plein", RulesEngine.batteryRef(mode, 100, false)?.id)
        assertEquals("moyen", RulesEngine.batteryRef(mode, 35, false)?.id)
        assertEquals("faible", RulesEngine.batteryRef(mode, 5, false)?.id)
        assertEquals("charge", RulesEngine.batteryRef(mode, 5, true)?.id)
        assertNull(RulesEngine.batteryRef(mode.copy(charging = null), null, true))
        // Seule la plage « faible » a un fond : rien au-dessus de 20 %.
        val lowOnly = DynamicMode.Battery(listOf(BatteryLevel(0, 20, ref("faible"))), charging = null)
        assertNull(RulesEngine.batteryRef(lowOnly, 80, false))
        assertEquals("faible", RulesEngine.batteryRef(lowOnly, 19, false)?.id)
    }

    @Test
    fun `météo, codes WMO, nuit et repli`() {
        assertEquals(WeatherCondition.CLEAR, RulesEngine.weatherFromCode(0, true))
        assertEquals(WeatherCondition.NIGHT, RulesEngine.weatherFromCode(1, false))
        assertEquals(WeatherCondition.RAIN, RulesEngine.weatherFromCode(63, true))
        assertEquals(WeatherCondition.SNOW, RulesEngine.weatherFromCode(75, true))
        assertEquals(WeatherCondition.STORM, RulesEngine.weatherFromCode(95, false))
        assertEquals(WeatherCondition.FOG, RulesEngine.weatherFromCode(45, true))
        val items = mapOf(WeatherCondition.CLEAR to ref("soleil"), WeatherCondition.RAIN to ref("pluie"))
        assertEquals("soleil", RulesEngine.weatherRef(items, WeatherCondition.NIGHT)?.id)
        assertEquals("pluie", RulesEngine.weatherRef(items, WeatherCondition.STORM)?.id)
        assertEquals(
            WeatherCondition.RAIN,
            WeatherClient.parse("""{"current":{"time":"2025-10-06T10:00","weather_code":61,"is_day":1}}"""),
        )
    }

    @Test
    fun `rotation, change seulement après l'intervalle, jamais deux fois le même`() {
        val config = AutomationConfig(rotation = RotationConfig(enabled = true, intervalMinutes = 60, shuffle = true, items = listOf(ref("a"), ref("b"), ref("c"))))
        val first = RulesEngine.decide(config, Environment(at(10)), AutomationState(), noManual, Random(1))
        assertEquals(Reason.ROTATION, first.reason)
        val sameHour = RulesEngine.decide(config, Environment(at(10, 30)), first.state, noManual, Random(2))
        assertEquals(first.home?.id, sameHour.home?.id)
        val nextHour = RulesEngine.decide(config, Environment(at(11, 0)), first.state, noManual, Random(3))
        assertNotEquals(first.home?.id, nextHour.home?.id)
        repeat(50) { seed ->
            assertNotEquals(1, RulesEngine.nextRotationIndex(1, 3, true, Random(seed)))
        }
        assertEquals(0, RulesEngine.nextRotationIndex(2, 3, false, Random(0)))
    }

    @Test
    fun `fonds dynamiques avant la rotation, cible respectée`() {
        val config = AutomationConfig(
            rotation = RotationConfig(enabled = true, items = listOf(ref("a"))),
            dynamic = DynamicConfig(enabled = true, target = WallpaperTarget.LOCK, mode = DynamicMode.Time(listOf(TimeSlot(0, ref("jour"))))),
        )
        val decision = RulesEngine.decide(config, Environment(at(10)), AutomationState(), noManual)
        assertEquals(Reason.DYNAMIC, decision.reason)
        assertNull(decision.home)
        assertEquals("jour", decision.lock?.id)
    }

    @Test
    fun `prochain changement prévu`() {
        val config = AutomationConfig(focus = workFocus)
        assertEquals(60, RulesEngine.minutesUntilNextChange(config, AutomationState(), at(8)))
        assertEquals(90, RulesEngine.minutesUntilNextChange(config, AutomationState(), at(10, 30)))
        // Vendredi 13 h → lundi 9 h.
        assertEquals(68 * 60, RulesEngine.minutesUntilNextChange(config, AutomationState(), at(13, day = 5)))
        assertNull(RulesEngine.minutesUntilNextChange(AutomationConfig(), AutomationState(), at(8)))
    }

    @Test
    fun `lecture de la configuration envoyée par l'app`() {
        val json = """
            {
              "rotation": { "enabled": true, "intervalMinutes": 5, "target": "home", "shuffle": false,
                            "items": [{ "id": "a", "uri": "https://x/a.jpg" }, { "id": "sans-uri" }] },
              "dynamic": { "enabled": true, "mode": "weather", "target": "lock",
                           "weather": { "latitude": 48.85, "longitude": 2.35,
                                        "items": { "clear": { "id": "s", "uri": "/data/s.jpg" }, "inconnu": { "id": "x", "uri": "/x" } } } },
              "focus": { "enabled": true, "item": { "id": "f", "uri": "/data/f.jpg" },
                         "schedules": [{ "days": [1, 2, 9], "start": "09:00", "end": "12:30" }, { "days": [], "start": "01:00", "end": "02:00" }] }
            }
        """.trimIndent()
        val config = AutomationConfig.fromJson(JSONObject(json))
        assertEquals(15, config.rotation.intervalMinutes)
        assertEquals(WallpaperTarget.HOME, config.rotation.target)
        assertEquals(listOf("a"), config.rotation.items.map { it.id })
        val weather = config.dynamic.mode as DynamicMode.Weather
        assertEquals(setOf(WeatherCondition.CLEAR), weather.items.keys)
        assertEquals(1, config.focus.schedules.size)
        assertEquals(setOf(1, 2), config.focus.schedules[0].days)
        assertEquals(12 * 60 + 30, config.focus.schedules[0].endMinute)
        assertTrue(config.anyEnabled)
        assertEquals(setOf("a", "s", "f"), config.refs().map { it.id }.toSet())
        assertFalse(AutomationConfig.parse("pas du json").anyEnabled)
        assertNull(AutomationConfig.parseMinute("25:00"))
    }

    @Test
    fun `fond dynamique sans fond prévu pour la situation, on restaure le fond manuel`() {
        val config = AutomationConfig(
            dynamic = DynamicConfig(
                enabled = true,
                target = WallpaperTarget.HOME,
                mode = DynamicMode.Battery(listOf(BatteryLevel(0, 20, ref("faible"))), charging = null),
            ),
        )
        val manual = mapOf(WallpaperTarget.HOME to ref("maison"), WallpaperTarget.LOCK to ref("verrou"))
        val low = RulesEngine.decide(config, Environment(at(10), batteryLevel = 10), AutomationState(), { manual[it] })
        assertEquals(Reason.DYNAMIC, low.reason)
        assertTrue(low.state.dynamicApplied)
        val recharged = RulesEngine.decide(config, Environment(at(11), batteryLevel = 60), low.state, { manual[it] })
        assertEquals(Reason.RESTORE, recharged.reason)
        assertEquals("maison", recharged.home?.id)
        assertNull(recharged.lock)
        assertFalse(recharged.state.dynamicApplied)
    }

    @Test
    fun `météo inconnue, on ne touche à rien`() {
        val config = AutomationConfig(
            dynamic = DynamicConfig(enabled = true, mode = DynamicMode.Weather(48.8, 2.3, mapOf(WeatherCondition.RAIN to ref("pluie")))),
        )
        val state = AutomationState(dynamicApplied = true, appliedHome = "pluie")
        val decision = RulesEngine.decide(config, Environment(at(10), weather = null), state, { ref("maison") })
        assertEquals(Reason.NONE, decision.reason)
        assertEquals(state, decision.state)
        val sunny = RulesEngine.decide(config, Environment(at(10), weather = WeatherCondition.CLEAR), state, { ref("maison") })
        assertEquals(Reason.RESTORE, sunny.reason)
    }

    @Test
    fun `seuls l'activation, le mode et l'écran visé imposent une réapplication`() {
        val base = AutomationConfig(rotation = RotationConfig(enabled = true, items = listOf(ref("a"))))
        assertEquals(base.signature(), base.copy(rotation = base.rotation.copy(items = listOf(ref("b")))).signature())
        assertNotEquals(base.signature(), base.copy(rotation = base.rotation.copy(target = WallpaperTarget.LOCK)).signature())
        assertNotEquals(base.signature(), base.copy(focus = workFocus).signature())
    }

    @Test
    fun `conversion du calendrier, lundi = 1, dimanche = 7`() {
        val calendar = Calendar.getInstance().apply {
            set(2025, Calendar.OCTOBER, 5, 14, 30)
        }
        val m = AutomationStore.moment(calendar)
        assertEquals(7, m.dayOfWeek)
        assertEquals(14 * 60 + 30, m.minuteOfDay)
        assertEquals(10, m.month)
    }

    @Test
    fun `fête ou lieu prioritaire sur la rotation, puis retour à la rotation ou au fond manuel`() {
        val rotation = AutomationConfig(rotation = RotationConfig(enabled = true, items = listOf(ref("a"), ref("b"))))
        val override = Override(ref("noel"), WallpaperTarget.HOME, Reason.EVENT)
        val during = RulesEngine.decide(rotation, Environment(at(10)), AutomationState(), noManual, overrides = listOf(override))
        assertEquals(Reason.EVENT, during.reason)
        assertEquals("noel", during.home?.id)
        assertNull(during.lock)
        assertEquals(WallpaperTarget.HOME, during.state.overrideTarget)

        val after = RulesEngine.decide(rotation, Environment(at(11)), during.state, noManual)
        assertEquals(Reason.ROTATION, after.reason)
        assertNull(after.state.overrideTarget)

        // Sans autre automatisme : le fond choisi à la main revient, sur l'écran concerné seulement.
        val manual = mapOf(WallpaperTarget.HOME to ref("maison"), WallpaperTarget.LOCK to ref("verrou"))
        val restored = RulesEngine.decide(AutomationConfig(), Environment(at(11)), during.state, { manual[it] })
        assertEquals(Reason.RESTORE, restored.reason)
        assertEquals("maison", restored.home?.id)
        assertNull(restored.lock)
        assertNull(restored.state.overrideTarget)
    }

    @Test
    fun `le mode focus reste prioritaire sur une fête`() {
        val config = AutomationConfig(focus = workFocus)
        val decision = RulesEngine.decide(config, Environment(at(10)), AutomationState(), noManual, overrides = listOf(Override(ref("noel"), WallpaperTarget.BOTH, Reason.EVENT)))
        assertEquals(Reason.FOCUS, decision.reason)
    }
}
