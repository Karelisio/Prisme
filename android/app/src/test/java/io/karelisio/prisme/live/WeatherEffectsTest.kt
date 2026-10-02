package io.karelisio.prisme.live

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale
import kotlin.random.Random

class WeatherEffectsTest {
    private val lyon = 45.76 to 4.84
    private val minute = 60_000L

    private fun reading(code: Int, precipitation: Float = 0f, wind: Float = 10f, isDay: Boolean = true, fetchedAt: Long = 1_000_000L, place: Pair<Double, Double> = lyon) =
        WeatherReading(code, precipitation, wind, isDay, place.first, place.second, fetchedAt)

    @Test
    fun `codes météo, effet et intensité`() {
        assertEquals(WeatherEffect.NONE, WeatherRules.effectOf(0).first)
        assertEquals(WeatherEffect.NONE, WeatherRules.effectOf(3).first)
        assertEquals(WeatherEffect.FOG, WeatherRules.effectOf(45).first)
        assertEquals(WeatherEffect.DRIZZLE, WeatherRules.effectOf(53).first)
        assertEquals(WeatherEffect.RAIN, WeatherRules.effectOf(63).first)
        assertEquals(WeatherEffect.RAIN, WeatherRules.effectOf(81).first)
        assertEquals(WeatherEffect.SNOW, WeatherRules.effectOf(75).first)
        assertEquals(WeatherEffect.SNOW, WeatherRules.effectOf(86).first)
        assertEquals(WeatherEffect.STORM, WeatherRules.effectOf(99).first)
        assertEquals(WeatherEffect.NONE, WeatherRules.effectOf(1234).first)
        // Plus le code est fort, plus il y a de gouttes.
        assertTrue(WeatherRules.effectOf(61).second < WeatherRules.effectOf(63).second)
        assertTrue(WeatherRules.effectOf(63).second < WeatherRules.effectOf(65).second)
        assertTrue(WeatherRules.effectOf(71).second < WeatherRules.effectOf(75).second)
    }

    @Test
    fun `rien n'est dessiné par ciel clair ou nuageux, ni sans relevé`() {
        assertEquals(WeatherLook.NONE, WeatherRules.look(reading(0), null))
        assertEquals(WeatherLook.NONE, WeatherRules.look(reading(3, precipitation = 0.2f), null))
        assertEquals(WeatherLook.NONE, WeatherRules.look(null, null))
    }

    @Test
    fun `plus de précipitations donnent plus de gouttes, le vent penche la pluie`() {
        val light = WeatherRules.look(reading(63, precipitation = 0f, wind = 5f), null)
        val heavy = WeatherRules.look(reading(63, precipitation = 3f, wind = 45f), null)
        assertEquals(WeatherEffect.RAIN, light.effect)
        assertTrue(heavy.intensity > light.intensity)
        assertTrue(heavy.slant > light.slant)
        assertTrue(heavy.slant < 0.6f)
        assertTrue(heavy.dim > 0f)
        assertTrue(WeatherRules.look(reading(65, precipitation = 50f), null).intensity <= 1f)
        // Brouillard : ni pluie penchée ni pénombre ; neige : dérive selon le vent.
        val fog = WeatherRules.look(reading(45, wind = 30f), null)
        assertEquals(0f, fog.slant, 0f)
        assertEquals(0f, fog.dim, 0f)
        assertTrue(WeatherRules.look(reading(73, wind = 40f), null).drift > 0.5f)
        // La nuit, les effets restent mais plus discrets (dessin).
        assertTrue(WeatherRules.look(reading(61, isDay = false), null).night)
        // Valeurs manquantes (NaN) sans effet de bord.
        val odd = WeatherRules.look(reading(61, precipitation = Float.NaN, wind = Float.NaN), null)
        assertFalse(odd.intensity.isNaN() || odd.slant.isNaN())
    }

    @Test
    fun `aperçu choisi dans l'app, prioritaire, même sans relevé`() {
        assertEquals(WeatherEffect.RAIN, WeatherRules.look(null, WeatherEffect.RAIN).effect)
        assertEquals(WeatherEffect.SNOW, WeatherRules.look(reading(0), WeatherEffect.SNOW).effect)
        assertEquals(WeatherEffect.STORM, WeatherRules.look(reading(61), WeatherEffect.STORM).effect)
        for (effect in WeatherEffect.entries) {
            val look = WeatherRules.previewLook(effect)
            assertEquals(effect, look.effect)
            assertTrue(look.intensity in 0f..1f)
        }
    }

    @Test
    fun `réglages de la météo animée`() {
        assertEquals(WeatherSettings.OFF, WeatherRules.settings(JSONObject()))
        val auto = WeatherRules.settings(
            JSONObject("""{"weather":{"enabled":true,"latitude":45.76,"longitude":4.84,"name":"Lyon","preview":"auto"}}"""),
        )
        assertTrue(auto.enabled)
        assertEquals(45.76, auto.latitude!!, 1e-9)
        assertEquals(4.84, auto.longitude!!, 1e-9)
        assertNull(auto.preview)
        val preview = WeatherRules.settings(JSONObject("""{"weather":{"enabled":true,"preview":"storm"}}"""))
        assertEquals(WeatherEffect.STORM, preview.preview)
        assertNull(preview.latitude)
        assertNull(WeatherRules.settings(JSONObject("""{"weather":{"enabled":true,"latitude":123,"longitude":4}}""")).latitude)
        assertFalse(WeatherRules.settings(JSONObject("""{"weather":{"latitude":1,"longitude":2}}""")).enabled)
    }

    @Test
    fun `lecture de la réponse d'Open-Meteo`() {
        val body = """{"latitude":45.76,"longitude":4.84,"current":{"time":"2026-10-02T14:00","interval":900,"weather_code":61,"precipitation":0.4,"wind_speed_10m":18.5,"is_day":0}}"""
        val parsed = WeatherRules.parse(body, 45.76, 4.84, 42L)
        assertEquals(61, parsed.code)
        assertEquals(0.4f, parsed.precipitation, 1e-6f)
        assertEquals(18.5f, parsed.windKmh, 1e-6f)
        assertFalse(parsed.isDay)
        assertEquals(42L, parsed.fetchedAt)
        // Champs facultatifs absents : valeurs neutres.
        val minimal = WeatherRules.parse("""{"current":{"weather_code":71}}""", 1.0, 2.0, 0L)
        assertEquals(0f, minimal.precipitation, 0f)
        assertTrue(minimal.isDay)
    }

    @Test
    fun `adresse de la requête, indépendante de la langue du téléphone`() {
        val before = Locale.getDefault()
        try {
            Locale.setDefault(Locale.FRANCE)
            val url = WeatherRules.url(45.76, 4.84)
            assertTrue(url, url.startsWith("https://api.open-meteo.com/v1/forecast?latitude=45.7600&longitude=4.8400&"))
            assertTrue(url.endsWith("current=weather_code,precipitation,wind_speed_10m,is_day"))
        } finally {
            Locale.setDefault(before)
        }
    }

    @Test
    fun `relevé au plus toutes les 30 minutes, nouvel essai 10 minutes après un échec`() {
        val fetched = reading(61, fetchedAt = 1_000_000L)
        val (lat, lon) = lyon
        assertFalse(WeatherRules.shouldFetch(1_000_000L + 29 * minute, fetched, 1_000_000L, lat, lon))
        assertTrue(WeatherRules.shouldFetch(1_000_000L + 31 * minute, fetched, 1_000_000L, lat, lon))
        // Autre lieu choisi (essai effacé) : relevé tout de suite.
        assertTrue(WeatherRules.shouldFetch(1_000_000L + minute, fetched, 0L, 48.85, 2.35))
        // Échec récent : on attend.
        val now = 50 * minute
        assertFalse(WeatherRules.shouldFetch(now, null, now - 5 * minute, lat, lon))
        assertTrue(WeatherRules.shouldFetch(now, null, now - 11 * minute, lat, lon))
        assertTrue(WeatherRules.shouldFetch(now, null, 0L, lat, lon))
        // Horloge remise en arrière : on relève.
        assertTrue(WeatherRules.shouldFetch(500L, fetched, 0L, lat, lon))
        // Prochaine vérification : à l'échéance du relevé, au moins une minute plus tard.
        assertEquals(20 * minute, WeatherRules.nextCheckDelay(now, reading(61, fetchedAt = now - 10 * minute), now - 10 * minute))
        assertEquals(8 * minute, WeatherRules.nextCheckDelay(now, null, now - 2 * minute))
        assertEquals(minute, WeatherRules.nextCheckDelay(now, null, 0L))
    }

    @Test
    fun `relevé d'un autre lieu ignoré, dernier relevé gardé hors ligne`() {
        val settings = WeatherSettings(enabled = true, latitude = 45.7601, longitude = 4.8399, preview = null)
        val old = reading(61, fetchedAt = 1L)
        assertEquals(old, WeatherRules.usable(old, settings))
        assertNull(WeatherRules.usable(reading(61, place = 48.85 to 2.35), settings))
        assertNull(WeatherRules.usable(old, settings.copy(latitude = null)))
        assertNull(WeatherRules.usable(null, settings))
    }

    @Test
    fun `éclair, flash bref, puis un second plus faible, rares`() {
        assertEquals(0f, Lightning.flash(0), 1e-6f)
        assertEquals(0.42f, Lightning.flash(50), 1e-6f)
        val second = Lightning.flash(300)
        assertTrue(second > 0f && second <= 0.28f)
        assertEquals(0f, Lightning.flash(Lightning.DURATION_MS), 0f)
        assertEquals(0f, Lightning.flash(-10), 0f)
        val random = Random(5)
        repeat(100) { assertTrue(Lightning.nextDelayMs(random) in 6_000L until 18_000L) }
    }
}
