package io.karelisio.prisme.quote

import io.karelisio.prisme.wallpaper.RenderSignature
import io.karelisio.prisme.wallpaper.WallpaperTarget
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QuoteConfigTest {
    @Test
    fun `reglages complets`() {
        val raw = """
            {"enabled": true, "target": "both", "font": "sans", "position": "top", "size": "large", "color": "black", "shift": 4,
             "quotes": [{"text": "  Petit à petit  ", "author": " Proverbe "}, {"text": "Sans auteur"}, {"text": "   "}, {"author": "orphelin"}, 3]}
        """.trimIndent()
        val config = QuoteConfig.parse(raw)
        assertTrue(config.enabled)
        assertEquals(WallpaperTarget.BOTH, config.target)
        assertEquals(QuoteStyle(QuoteFont.SANS, QuotePosition.TOP, QuoteSize.LARGE, QuoteColor.BLACK), config.style)
        assertEquals(4, config.shift)
        assertEquals(listOf(Quote("Petit à petit", "Proverbe"), Quote("Sans auteur", null)), config.quotes)
    }

    @Test
    fun `valeurs par defaut quand tout manque ou est inconnu`() {
        val defaults = QuoteConfig()
        assertFalse(defaults.enabled)
        assertEquals(WallpaperTarget.LOCK, defaults.target)
        assertEquals(QuoteStyle(QuoteFont.SERIF, QuotePosition.BOTTOM, QuoteSize.MEDIUM, QuoteColor.AUTO), defaults.style)
        assertEquals(defaults, QuoteConfig.parse(null))
        assertEquals(defaults, QuoteConfig.parse(""))
        assertEquals(defaults, QuoteConfig.parse("pas du json"))
        assertEquals(defaults, QuoteConfig.parse("{}"))
        val odd = QuoteConfig.fromJson(JSONObject("""{"target": "plafond", "font": "comic", "position": 3, "size": "énorme", "color": "rose", "shift": -5}"""))
        assertEquals(defaults, odd)
    }

    @Test
    fun `bornes de surete`() {
        val long = "x".repeat(1000)
        val config = QuoteConfig.parse("""{"enabled": true, "quotes": [{"text": "$long", "author": "$long"}]}""")
        assertEquals(QuoteConfig.MAX_TEXT, config.quotes.single().text.length)
        assertEquals(QuoteConfig.MAX_AUTHOR, config.quotes.single().author?.length)
        val many = (0 until QuoteConfig.MAX_QUOTES + 50).joinToString(",", "[", "]") { """{"text": "t$it"}""" }
        assertEquals(QuoteConfig.MAX_QUOTES, QuoteConfig.parse("""{"quotes": $many}""").quotes.size)
    }

    @Test
    fun `ecrans vises`() {
        fun applies(target: WallpaperTarget, enabled: Boolean = true) = QuoteConfig(enabled = enabled, target = target).let { it.appliesTo(QuoteScreen.HOME) to it.appliesTo(QuoteScreen.LOCK) }
        assertEquals(false to true, applies(WallpaperTarget.LOCK))
        assertEquals(true to false, applies(WallpaperTarget.HOME))
        assertEquals(true to true, applies(WallpaperTarget.BOTH))
        assertEquals(false to false, applies(WallpaperTarget.BOTH, enabled = false))
        val spec = QuoteSpec(Quote("A"), QuoteStyle(), WallpaperTarget.HOME)
        assertTrue(spec.appliesTo(QuoteScreen.HOME))
        assertFalse(spec.appliesTo(QuoteScreen.LOCK))
    }

    @Test
    fun `identite du rendu, qui change avec la phrase ou la presentation`() {
        val base = QuoteSpec(Quote("Phrase", "Auteur"), QuoteStyle(), WallpaperTarget.LOCK)
        assertEquals(base.key(), base.copy(target = WallpaperTarget.BOTH).key())
        assertNotEquals(base.key(), base.copy(quote = Quote("Autre", "Auteur")).key())
        assertNotEquals(base.key(), base.copy(quote = Quote("Phrase", null)).key())
        assertNotEquals(base.key(), base.copy(style = QuoteStyle(font = QuoteFont.SANS)).key())
        assertNotEquals(base.key(), base.copy(style = QuoteStyle(position = QuotePosition.TOP)).key())
        assertNotEquals(base.key(), base.copy(style = QuoteStyle(size = QuoteSize.SMALL)).key())
        assertNotEquals(base.key(), base.copy(style = QuoteStyle(color = QuoteColor.WHITE)).key())
    }

    @Test
    fun `signature d un rendu, palier du voile et phrase`() {
        val spec = QuoteSpec(Quote("Phrase"), QuoteStyle(), WallpaperTarget.LOCK)
        assertEquals("0.000|", RenderSignature.of(0f, null))
        assertEquals("0.350|", RenderSignature.of(0.35f, null))
        // Les écarts d'arrondi des flottants ne changent pas le palier.
        assertEquals(RenderSignature.of(0.35f, null), RenderSignature.of(7 * 0.05f, null))
        assertNotEquals(RenderSignature.of(0.35f, null), RenderSignature.of(0.4f, null))
        assertNotEquals(RenderSignature.of(0f, null), RenderSignature.of(0f, spec))
    }
}
