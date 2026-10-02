package io.karelisio.prisme.automation

import io.karelisio.prisme.wallpaper.WallpaperRef
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class OnlineRotationTest {
    private val screen = OnlineSources.Screen(1080, 2400)

    private fun at(minutes: Long) = Moment(epochMillis = minutes * 60_000L, dayOfWeek = 1, minuteOfDay = 600, month = 10)

    private fun candidate(id: String, source: String = "unsplash", alt: String = "photo", author: String? = null) = OnlineCandidate(
        id = id,
        source = source,
        width = 1080,
        height = 2400,
        color = "#204080",
        alt = alt,
        thumb = "t",
        preview = "p",
        full = "https://x/$id",
        applyUrl = "https://x/$id?w=1200",
        authorName = author,
        authorUrl = author?.let { "https://x/@$it" },
    )

    private val onlineConfig = OnlineConfig(
        key = "nature",
        queries = listOf(
            OnlineQuery("unsplash", query = "nature landscape", auth = "Client-ID cle"),
            OnlineQuery("wallhaven", query = "nature", categories = "100"),
        ),
    )

    @Test
    fun `configuration envoyée par l'app`() {
        val json = JSONObject(
            """
            {"rotation":{"enabled":true,"intervalMinutes":60,"target":"both","items":[],
              "online":{"key":"k","wifiOnly":true,
                "queries":[{"provider":"unsplash","query":"mer","auth":"Client-ID x"},{"provider":"pixabay","query":"mer"}],
                "exclude":{"ids":["unsplash:1"],"authors":["unsplash:ada"],"words":["voiture"]}}}}
            """.trimIndent(),
        )
        val config = AutomationConfig.fromJson(json)
        val online = config.rotation.online
        assertNotNull(online)
        assertEquals(listOf("unsplash"), online!!.queries.map { it.provider })
        assertTrue(online.wifiOnly)
        assertTrue(config.rotation.active)
        assertTrue(config.anyEnabled)
        assertTrue(online.exclusions.excludes(candidate("unsplash:1")))
        // Sans requête utilisable, pas de rotation en ligne.
        assertNull(OnlineConfig.fromJson(JSONObject("""{"key":"k","queries":[{"provider":"pixabay"}]}""")))
    }

    @Test
    fun `requêtes des sources`() {
        val random = Random(1)
        val unsplash = OnlineSources.request(OnlineQuery("unsplash", query = "nature landscape", auth = "Client-ID cle"), random)
        assertTrue(unsplash.url.startsWith("https://api.unsplash.com/photos/random?"))
        assertTrue(unsplash.url.contains("count=30") && unsplash.url.contains("orientation=portrait") && unsplash.url.contains("query=nature+landscape"))
        assertEquals("Client-ID cle", unsplash.headers["Authorization"])
        val user = OnlineSources.request(OnlineQuery("unsplash", username = "ada", auth = "Client-ID cle"), random)
        assertTrue(user.url.startsWith("https://api.unsplash.com/users/ada/photos?"))
        val wallhaven = OnlineSources.request(OnlineQuery("wallhaven", categories = "010"), random).url
        assertTrue(wallhaven.contains("sorting=random") && wallhaven.contains("purity=100") && wallhaven.contains("categories=010"))
        assertFalse(wallhaven.contains("q="))
        val pexels = OnlineSources.request(OnlineQuery("pexels", query = "mer", auth = "k"), random)
        val page = Regex("[?&]page=(\\d+)").find(pexels.url)!!.groupValues[1].toInt()
        assertTrue(page in 1..10)
        assertEquals("k", pexels.headers["Authorization"])
        assertTrue(OnlineSources.request(OnlineQuery("pexels"), random, firstPage = true).url.contains("/curated?per_page=40&page=1"))
        val art = OnlineSources.request(OnlineQuery("art"), random).url
        assertTrue(Regex("skip=(\\d+)").find(art)!!.groupValues[1].toInt() % 100 == 0)
        assertTrue(OnlineSources.request(OnlineQuery("nasa", query = "galaxy"), random).url.contains("q=galaxy"))
    }

    @Test
    fun `photos Unsplash au hasard, portrait HD à la taille de l'écran`() {
        val body = """
            [{"id":"a1","width":3000,"height":6000,"color":"#0c0c0c","alt_description":"montagne","description":null,
              "urls":{"raw":"https://images.unsplash.com/photo-a1?ixid=abc"},
              "links":{"html":"https://unsplash.com/photos/a1","download_location":"https://api.unsplash.com/photos/a1/download?ixid=abc"},
              "user":{"name":"Ada","username":"ada","links":{"html":"https://unsplash.com/@ada"}}},
             {"id":"paysage","width":6000,"height":4000,"color":"#ffffff","alt_description":null,"description":null,
              "urls":{"raw":"https://images.unsplash.com/photo-p"},"links":{"html":"h","download_location":"d"},
              "user":{"name":"Bob","links":{"html":"https://unsplash.com/@bob"}}}]
        """.trimIndent()
        val items = OnlineSources.parse("unsplash", body, screen)
        assertEquals(listOf("unsplash:a1"), items.map { it.id })
        val c = items[0]
        assertTrue(c.applyUrl.contains("w=1320") && c.applyUrl.contains("ixid=abc") && c.applyUrl.contains("fm=jpg"))
        assertTrue(c.full.contains("w=3000"))
        assertTrue(c.thumb.contains("w=360") && c.thumb.contains("h=640"))
        assertEquals("https://unsplash.com/@ada?utm_source=prisme&utm_medium=referral", c.authorUrl)
        assertEquals("ada", c.username)
        val wallpaper = c.toWallpaperJson()
        assertEquals("ada", wallpaper.getJSONObject("author").getString("username"))
        assertEquals(c, OnlineCandidate.fromJson(c.toJson()))
    }

    @Test
    fun `Pexels, Wallhaven, NASA et musée`() {
        val pexels = OnlineSources.parse(
            "pexels",
            """{"photos":[{"id":7,"width":2400,"height":4800,"url":"https://www.pexels.com/photo/7/","photographer":"Grace",
              "photographer_url":"https://www.pexels.com/@grace","avg_color":"#A0522D","alt":"forêt",
              "src":{"original":"https://images.pexels.com/photos/7/p.jpeg"}}]}""",
            screen,
        )
        assertEquals("pexels:7", pexels.single().id)
        assertTrue(pexels.single().applyUrl.contains("w=1320"))

        val wallhaven = OnlineSources.parse(
            "wallhaven",
            """{"data":[{"id":"x1","url":"https://wallhaven.cc/w/x1","dimension_x":1440,"dimension_y":3200,"colors":["#112233"],
              "path":"https://w.wallhaven.cc/full/x1/wallhaven-x1.jpg","thumbs":{"original":"https://th.wallhaven.cc/orig/x1/x1.jpg"}}]}""",
            screen,
        ).single()
        assertEquals("#112233", wallhaven.color)
        assertEquals(wallhaven.full, wallhaven.applyUrl)

        val nasa = OnlineSources.parse(
            "nasa",
            """{"collection":{"items":[
              {"data":[{"nasa_id":"PIA1","title":"Nébuleuse","media_type":"image","center":"JPL"}],
               "links":[{"href":"https://images-assets.nasa.gov/image/PIA1/PIA1~thumb.jpg","rel":"preview","render":"image"}]},
              {"data":[{"nasa_id":"PETIT","title":"Petit","media_type":"image"}],
               "links":[{"href":"https://images-assets.nasa.gov/image/PETIT/PETIT~thumb.jpg","rel":"preview","render":"image"},
                        {"href":"https://images-assets.nasa.gov/image/PETIT/PETIT~orig.jpg","rel":"canonical","render":"image","width":800,"height":600}]}]}}""",
            screen,
        )
        assertEquals(listOf("nasa:PIA1"), nasa.map { it.id })
        assertEquals("https://images-assets.nasa.gov/image/PIA1/PIA1~orig.jpg", nasa[0].applyUrl)
        assertEquals("NASA JPL", nasa[0].authorName)

        val art = OnlineSources.parse(
            "art",
            """{"data":[{"id":5,"title":"Crépuscule","creation_date":"1860","url":"https://clevelandart.org/art/5",
              "creators":[{"description":"Frederic Edwin Church (American, 1826–1900)"}],
              "images":{"web":{"url":"https://openaccess-cdn.clevelandart.org/5_web.jpg","width":"700","height":"893"},
                        "print":{"url":"https://openaccess-cdn.clevelandart.org/5_print.jpg","width":"2666","height":"3400"}}},
              {"id":6,"title":"Paysage large","url":"u","images":{"web":{"url":"w","width":"893","height":"600"},
                        "print":{"url":"p","width":"3400","height":"2280"}}}]}""",
            screen,
        )
        assertEquals(listOf("art:5"), art.map { it.id })
        assertEquals("Frederic Edwin Church", art[0].authorName)
        assertEquals("Crépuscule (1860)", art[0].alt)
    }

    @Test
    fun `contenus masqués exclus, sans accents ni majuscules`() {
        val exclusions = OnlineExclusions(ids = setOf("pexels:1"), authors = setOf("unsplash:ada"), words = listOf("Château"))
        assertTrue(exclusions.excludes(candidate("pexels:1", "pexels")))
        assertTrue(exclusions.excludes(candidate("unsplash:2", author = "ADA")))
        assertTrue(exclusions.excludes(candidate("unsplash:3", alt = "Un chateau la nuit")))
        assertFalse(exclusions.excludes(candidate("unsplash:4", alt = "Un chat noir")))
        assertTrue(OnlineSources.mentions("Two cats", "cat"))
        assertTrue(OnlineSources.mentions("red sports car", "sports car"))
    }

    @Test
    fun `paramètres d'URL remplacés sans toucher aux autres`() {
        assertEquals("https://x/p?ixid=a&w=10&fm=jpg", OnlineSources.withParams("https://x/p?ixid=a&w=5", "w" to 10, "fm" to "jpg", "q" to null))
        assertEquals("https://x/p?q=nature+landscape", OnlineSources.withParams("https://x/p", "q" to "nature landscape"))
        assertEquals(1320, OnlineSources.coverWidth(3000, 6000, screen))
        assertEquals(800, OnlineSources.coverWidth(800, 1600, screen))
    }

    @Test
    fun `les sources alternent, une source en échec est sautée, un petit catalogue resservi`() {
        val queries = listOf(OnlineQuery("unsplash"), OnlineQuery("wallhaven"), OnlineQuery("nasa"))
        val calls = mutableListOf<String>()
        val fetch = { q: OnlineQuery ->
            calls += q.provider
            when (q.provider) {
                "unsplash" -> throw java.io.IOException("hors ligne")
                "wallhaven" -> listOf(candidate("wallhaven:1", "wallhaven"), candidate("wallhaven:2", "wallhaven"))
                else -> listOf(candidate("nasa:1", "nasa"))
            }
        }
        val first = OnlineQueue.refill(queries, 0, Random(2), fetch, { true })
        assertEquals(listOf("unsplash", "wallhaven"), calls)
        assertEquals(setOf("wallhaven:1", "wallhaven:2"), first!!.first.map { it.id }.toSet())
        assertEquals(2, first.second)

        // Tout est récent : les fonds reviennent, sauf l'actuel.
        val again = OnlineQueue.refill(listOf(OnlineQuery("wallhaven")), 0, Random(2), fetch, { false }, { it.id != "wallhaven:1" })
        assertEquals(listOf("wallhaven:2"), again!!.first.map { it.id })
        assertNull(OnlineQueue.refill(listOf(OnlineQuery("unsplash")), 0, Random(2), fetch, { true }))
    }

    @Test
    fun `moteur, nouveau fond en ligne à l'échéance, gardé entre-temps`() {
        val config = AutomationConfig(rotation = RotationConfig(enabled = true, intervalMinutes = 60, online = onlineConfig))
        val first = RulesEngine.decide(config, Environment(at(100)), AutomationState(), { null }, nextOnline = { OnlinePick.Ready(WallpaperRef("unsplash:a", "https://x/a")) })
        assertEquals("unsplash:a", first.home?.id)
        assertEquals("unsplash:a", first.state.onlineRef?.id)
        assertEquals(100 * 60_000L, first.state.lastRotationAt)

        var asked = false
        val later = RulesEngine.decide(config, Environment(at(130)), first.state, { null }, nextOnline = { asked = true; OnlinePick.Failed })
        assertFalse(asked)
        assertEquals("unsplash:a", later.lock?.id)
        assertFalse(later.retry)

        val failed = RulesEngine.decide(config, Environment(at(170)), first.state, { null }, nextOnline = { OnlinePick.Failed })
        assertTrue(failed.retry)
        assertEquals("unsplash:a", failed.home?.id)

        val metered = RulesEngine.decide(config, Environment(at(170)), first.state, { null }, nextOnline = { OnlinePick.Later })
        assertFalse(metered.retry)
        assertEquals(first.state.lastRotationAt, metered.state.lastRotationAt)

        assertEquals(30, RulesEngine.minutesUntilNextChange(config, first.state, at(130)))
    }
}
