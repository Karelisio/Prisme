package io.karelisio.prisme.system

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SystemTest {
    @Test
    fun `journal borné aux dernières entrées, lignes vides ignorées`() {
        val lines = (1..60).map { "e$it" } + ""
        val kept = ErrorLog.trim(lines, ErrorLog.MAX_ENTRIES)
        assertEquals(ErrorLog.MAX_ENTRIES, kept.size)
        assertEquals("e11", kept.first())
        assertEquals("e60", kept.last())
    }

    @Test
    fun `entrée du journal, message lisible et pile tronquée`() {
        val error = IllegalStateException("x".repeat(10))
        val entry = ErrorLog.entry(42L, "Automatisme", error)
        assertEquals(42L, entry.getLong("at"))
        assertEquals("native", entry.getString("source"))
        assertEquals("Automatisme", entry.getString("where"))
        assertEquals("IllegalStateException: xxxxxxxxxx", entry.getString("message"))
        assertTrue(entry.getString("stack").length <= ErrorLog.MAX_STACK_CHARS)
        assertEquals("NullPointerException: sans message", ErrorLog.entry(0, "", NullPointerException()).getString("message"))
    }

    @Test
    fun `mise à jour acceptée seulement avec un signataire commun`() {
        assertTrue(UpdateInstaller.sameSigner(setOf("a"), setOf("a")))
        assertTrue(UpdateInstaller.sameSigner(setOf("b"), setOf("a", "b")))
        assertFalse(UpdateInstaller.sameSigner(setOf("c"), setOf("a")))
        // Signataires inconnus (anciens Android) : le système tranchera.
        assertTrue(UpdateInstaller.sameSigner(emptySet(), setOf("a")))
        assertEquals(64, UpdateInstaller.sha256(byteArrayOf(1, 2, 3)).length)
    }

    @Test
    fun `actions des raccourcis destinées à l'app`() {
        assertEquals("io.karelisio.prisme.action.", AppActions.PREFIX)
    }
}
