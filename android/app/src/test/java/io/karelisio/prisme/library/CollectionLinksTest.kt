package io.karelisio.prisme.library

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CollectionLinksTest {
    private val view = "android.intent.action.VIEW"
    private val link = "prisme://collection/eJyrVspLzE1VslIqSS0uycxLV9JRSi0qTi1RslIy-_A"

    @Test
    fun `accepte un lien de collection ouvert par un VIEW`() {
        assertEquals(link, CollectionLinks.accept(view, link))
        // La lecture du code revient à l'interface : un lien un peu abîmé lui est transmis tel quel.
        assertEquals("$link.", CollectionLinks.accept(view, "$link."))
    }

    @Test
    fun `ignore les autres actions, schémas, adresses et liens vides`() {
        assertNull(CollectionLinks.accept("android.intent.action.MAIN", link))
        assertNull(CollectionLinks.accept(null, link))
        assertNull(CollectionLinks.accept(view, null))
        assertNull(CollectionLinks.accept(view, "https://example.com/collection/abc"))
        assertNull(CollectionLinks.accept(view, "prisme://autre/abc"))
        assertNull(CollectionLinks.accept(view, CollectionLinks.PREFIX))
    }

    @Test
    fun `ignore un lien rejoué depuis les applications récentes`() {
        assertNull(CollectionLinks.accept(view, link, fromHistory = true))
    }

    @Test
    fun `refuse un lien démesuré`() {
        assertEquals("prisme://collection/a", CollectionLinks.accept(view, "prisme://collection/a"))
        val tooLong = CollectionLinks.PREFIX + "a".repeat(CollectionLinks.MAX_LENGTH)
        assertNull(CollectionLinks.accept(view, tooLong))
    }
}
