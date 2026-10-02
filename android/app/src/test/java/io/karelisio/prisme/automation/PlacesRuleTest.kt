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

class PlacesRuleTest {
    private fun ref(id: String) = WallpaperRef(id, "https://x/$id.jpg")

    private fun place(name: String, latitude: Double, longitude: Double, radius: Double) =
        PlaceConfig(name, latitude, longitude, radius, ref(name.lowercase()))

    private val home = place("Maison", 48.8566, 2.3522, 300.0)
    private val work = place("Travail", 48.8738, 2.2950, 300.0)

    /** Un degré de latitude fait environ 111,195 km. */
    private fun north(of: PlaceConfig, meters: Double) = GeoPoint(of.latitude + meters / 111_195.08, of.longitude)

    private fun at(hour: Int) = Moment(epochMillis = hour * 3_600_000L, dayOfWeek = 1, minuteOfDay = hour * 60, month = 10)

    @Test
    fun `distance entre deux points, formule de haversine`() {
        // Paris - Lyon : environ 391,5 km à vol d'oiseau.
        assertEquals(391_499.0, Places.distanceMeters(48.8566, 2.3522, 45.7640, 4.8357), 100.0)
        assertEquals(0.0, Places.distanceMeters(48.8566, 2.3522, 48.8566, 2.3522), 0.0)
        assertEquals(111.195, Places.distanceMeters(48.0, 2.0, 48.001, 2.0), 0.01)
        // Un millième de degré de longitude vaut moins qu'un de latitude, sauf à l'équateur.
        assertEquals(74.404, Places.distanceMeters(48.0, 2.0, 48.0, 2.001), 0.01)
        assertEquals(
            Places.distanceMeters(48.8566, 2.3522, 45.7640, 4.8357),
            Places.distanceMeters(45.7640, 4.8357, 48.8566, 2.3522),
            0.001,
        )
        // De part et d'autre de la ligne de changement de date.
        assertEquals(22_239.0, Places.distanceMeters(0.0, 179.9, 0.0, -179.9), 5.0)
        // Points opposés : la moitié de la circonférence, sans erreur d'arrondi dans l'arc sinus.
        assertEquals(20_015_114.0, Places.distanceMeters(0.0, 0.0, 0.0, 180.0), 5.0)
    }

    @Test
    fun `le premier lieu qui contient la position gagne`() {
        val small = place("Petit", 48.0, 2.0, 300.0)
        val large = place("Grand", 48.0, 2.0, 1000.0)
        val center = GeoPoint(48.0, 2.0)
        assertEquals("Petit", Places.choose(listOf(small, large), center, null)?.name)
        assertEquals("Grand", Places.choose(listOf(large, small), center, null)?.name)
        // À 500 m, seul le grand lieu contient la position.
        assertEquals("Grand", Places.choose(listOf(small, large), north(small, 500.0), null)?.name)
        // Dehors, ou sans aucun lieu : rien.
        assertNull(Places.choose(listOf(small, large), north(small, 1500.0), null))
        assertNull(Places.choose(emptyList(), center, null))
        // Les deux lieux de départ sont loin l'un de l'autre.
        assertEquals("Travail", Places.choose(listOf(home, work), north(work, 100.0), null)?.name)
        assertEquals("Maison", Places.choose(listOf(home, work), north(home, 100.0), null)?.name)
    }

    @Test
    fun `hystérésis, on reste dans le lieu jusqu'à 1,25 fois le rayon`() {
        val items = listOf(home)
        // À 1,1 fois le rayon : on n'y entre pas, mais on n'en sort pas non plus.
        val border = north(home, 330.0)
        assertNull(Places.choose(items, border, null))
        assertEquals("Maison", Places.choose(items, border, home.key)?.name)
        assertEquals("Maison", Places.choose(items, north(home, 374.0), home.key)?.name)
        assertNull(Places.choose(items, north(home, 376.0), home.key))
        assertEquals(1.25, Places.EXIT_FACTOR, 0.0)

        // Dérive du GPS en bordure de zone : on ne sort qu'à plus de 375 m et on ne rentre qu'à moins de 300 m.
        var memory = PlaceMemory()
        val steps = listOf(290.0 to true, 330.0 to true, 370.0 to true, 380.0 to false, 320.0 to false, 299.0 to true, 360.0 to true)
        steps.forEachIndexed { i, (meters, inside) ->
            val check = Places.check(items, north(home, meters), memory, now = i * 900_000L)
            assertEquals("à $meters m", inside, check.place != null)
            memory = check.memory
        }
    }

    @Test
    fun `un lieu plus haut dans la liste reprend la main dès qu'il contient la position`() {
        val a = place("A", 48.0, 2.0, 300.0)
        // B est centré à 850 m au nord de A, avec un rayon de 700 m.
        val b = place("B", 48.0 + 850.0 / 111_195.08, 2.0, 700.0)
        val items = listOf(a, b)
        // Au centre de A, on était dans la zone élargie de B : A l'emporte, il est en tête de liste.
        assertEquals("A", Places.choose(items, GeoPoint(48.0, 2.0), b.key)?.name)
        // À 350 m au nord de A (dans l'élargissement de A, au cœur de B), A garde la main s'il est déjà retenu...
        assertEquals("A", Places.choose(items, north(a, 350.0), a.key)?.name)
        // ... et B prend le relais sinon, puisque A ne contient pas encore la position.
        assertEquals("B", Places.choose(items, north(a, 350.0), null)?.name)
    }

    @Test
    fun `lieu retenu, oublié après un délai ou s'il n'existe plus`() {
        val items = listOf(home, work)
        val memory = PlaceMemory(work.key, at = 1_000L)
        assertEquals("Travail", Places.remembered(items, memory, 1_000L)?.name)
        assertEquals("Travail", Places.remembered(items, memory, 1_000L + Places.MEMORY_MAX_AGE_MS)?.name)
        assertNull(Places.remembered(items, memory, 1_001L + Places.MEMORY_MAX_AGE_MS))
        // Horloge reculée : on ne se fie pas à une mémoire « du futur ».
        assertNull(Places.remembered(items, memory, 500L))
        assertNull(Places.remembered(listOf(home), memory, 1_000L))
        assertNull(Places.remembered(items, PlaceMemory(), 1_000L))
        // La clé ne dépend ni du rayon ni du fond : les modifier ne fait pas « quitter » le lieu.
        assertEquals(home.key, home.copy(radius = 900.0, ref = ref("autre")).key)
        assertNotEquals(home.key, home.copy(name = "Chez moi").key)
    }

    @Test
    fun `sans position, le lieu retenu est gardé un moment puis oublié`() {
        val items = listOf(home, work)
        val inWork = Places.check(items, north(work, 50.0), PlaceMemory(), now = 10_000L)
        assertEquals("Travail", inWork.place?.name)
        assertEquals(PlaceMemory(work.key, 10_000L), inWork.memory)

        val keep = Places.check(items, null, inWork.memory, now = 10_000L + 3_600_000L)
        assertEquals("Travail", keep.place?.name)
        // La mémoire n'est pas rajeunie : sans position, rien ne confirme qu'on y est toujours.
        assertEquals(inWork.memory, keep.memory)

        val forgotten = Places.check(items, null, inWork.memory, now = 10_000L + Places.MEMORY_MAX_AGE_MS + 1)
        assertNull(forgotten.place)
        // Sans rien de retenu, pas de position : pas de lieu.
        assertNull(Places.check(items, null, PlaceMemory(), now = 0L).place)
    }

    @Test
    fun `avec une position, la mémoire suit les allées et venues`() {
        val items = listOf(home, work)
        val arrived = Places.check(items, north(home, 20.0), PlaceMemory(), now = 5_000L)
        assertEquals(PlaceMemory(home.key, 5_000L), arrived.memory)
        // Le fond du lieu change de maison au travail sans passer par « aucun lieu ».
        val atWork = Places.check(items, north(work, 20.0), arrived.memory, now = 6_000L)
        assertEquals("Travail", atWork.place?.name)
        assertEquals(PlaceMemory(work.key, 6_000L), atWork.memory)
        // En route : plus aucun lieu, la mémoire est vidée.
        val away = Places.check(items, GeoPoint(48.80, 2.20), atWork.memory, now = 7_000L)
        assertNull(away.place)
        assertEquals(PlaceMemory(null, 7_000L), away.memory)
    }

    @Test
    fun `lecture des lieux envoyés par l'app`() {
        val json = """
            {
              "places": {
                "enabled": true, "target": "lock",
                "items": [
                  { "name": "Maison", "latitude": 48.8566, "longitude": 2.3522, "radius": 600, "item": { "id": "m", "uri": "https://x/m.jpg" } },
                  { "name": "Sans fond", "latitude": 48.0, "longitude": 2.0, "radius": 300 },
                  { "name": "Hors du globe", "latitude": 95.0, "longitude": 2.0, "radius": 300, "item": { "id": "h", "uri": "/h.jpg" } },
                  { "name": "Sans position", "radius": 300, "item": { "id": "p", "uri": "/p.jpg" } },
                  { "name": "Minuscule", "latitude": 45.0, "longitude": 4.0, "radius": 5, "item": { "id": "t", "uri": "/t.jpg" } },
                  { "name": "Rayon absent", "latitude": -33.9, "longitude": 151.2, "item": { "id": "s", "uri": "/s.jpg" } }
                ]
              }
            }
        """.trimIndent()
        val config = AutomationConfig.fromJson(JSONObject(json))
        assertTrue(config.places.enabled)
        assertEquals(WallpaperTarget.LOCK, config.places.target)
        assertEquals(listOf("Maison", "Minuscule", "Rayon absent"), config.places.items.map { it.name })
        assertEquals(listOf(600.0, 50.0, 300.0), config.places.items.map { it.radius })
        assertEquals(48.8566, config.places.items[0].latitude, 0.0)
        assertEquals("m", config.places.items[0].ref.id)
        assertTrue(config.places.active)
        assertTrue(config.anyEnabled)
        assertEquals(setOf("m", "t", "s"), config.refs().map { it.id }.toSet())

        // Rien d'envoyé, ou activé sans aucun lieu : rien d'actif.
        assertFalse(AutomationConfig.fromJson(JSONObject("{}")).places.active)
        val empty = AutomationConfig.fromJson(JSONObject("""{ "places": { "enabled": true, "items": [] } }"""))
        assertFalse(empty.anyEnabled)
        assertEquals(WallpaperTarget.BOTH, empty.places.target)
    }

    @Test
    fun `les lieux comptent dans la réapplication immédiate`() {
        val base = AutomationConfig(places = PlacesConfig(enabled = true, items = listOf(home)))
        assertNotEquals(AutomationConfig().signature(), base.signature())
        assertNotEquals(base.signature(), base.copy(places = base.places.copy(target = WallpaperTarget.HOME)).signature())
        // Un simple changement de fond ou de rayon est géré par le moteur, sans réapplication forcée.
        assertEquals(base.signature(), base.copy(places = base.places.copy(items = listOf(home.copy(radius = 900.0)))).signature())
    }

    @Test
    fun `fond du lieu posé sur l'écran visé, puis fond manuel rétabli en sortant`() {
        val config = AutomationConfig(places = PlacesConfig(enabled = true, target = WallpaperTarget.LOCK, items = listOf(home)))
        val manual = mapOf(WallpaperTarget.HOME to ref("accueil"), WallpaperTarget.LOCK to ref("verrou"))
        val override = Override(home.ref, config.places.target, Reason.PLACE)

        val inside = RulesEngine.decide(config, Environment(at(10)), AutomationState(), { manual[it] }, overrides = listOf(override))
        assertEquals(Reason.PLACE, inside.reason)
        assertNull(inside.home)
        assertEquals("maison", inside.lock?.id)
        assertEquals(WallpaperTarget.LOCK, inside.state.overrideTarget)

        val outside = RulesEngine.decide(config, Environment(at(11)), inside.state, { manual[it] })
        assertEquals(Reason.RESTORE, outside.reason)
        assertNull(outside.home)
        assertEquals("verrou", outside.lock?.id)
        assertNull(outside.state.overrideTarget)
    }

    @Test
    fun `le mode focus passe avant le lieu`() {
        val focus = FocusConfig(
            enabled = true,
            ref = ref("focus"),
            schedules = listOf(FocusSchedule(setOf(1), 9 * 60, 12 * 60)),
        )
        val config = AutomationConfig(places = PlacesConfig(enabled = true, items = listOf(home)), focus = focus)
        val decision = RulesEngine.decide(
            config,
            Environment(at(10)),
            AutomationState(),
            { null },
            overrides = listOf(Override(home.ref, WallpaperTarget.BOTH, Reason.PLACE)),
        )
        assertEquals(Reason.FOCUS, decision.reason)
        assertTrue(RulesEngine.focusActive(config.focus, at(10)))
    }
}
