package io.karelisio.prisme.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveRulesTest {
    @Test
    fun `pause en économie de batterie`() {
        assertTrue(EcoRules.paused(enabled = true, powerSave = true, batteryPercent = 80, charging = false))
        assertTrue(EcoRules.paused(enabled = true, powerSave = false, batteryPercent = 15, charging = false))
        assertFalse(EcoRules.paused(enabled = true, powerSave = false, batteryPercent = 16, charging = false))
        // En charge, une batterie faible ne fige plus le fond ; l'économie d'énergie, si.
        assertFalse(EcoRules.paused(enabled = true, powerSave = false, batteryPercent = 5, charging = true))
        assertTrue(EcoRules.paused(enabled = true, powerSave = true, batteryPercent = 5, charging = true))
        // Niveau inconnu : seule l'économie d'énergie compte.
        assertFalse(EcoRules.paused(enabled = true, powerSave = false, batteryPercent = null, charging = false))
        // Option coupée : jamais de pause.
        assertFalse(EcoRules.paused(enabled = false, powerSave = true, batteryPercent = 3, charging = false))
    }

    @Test
    fun `double-tap rapide et rapproché`() {
        val detector = DoubleTapDetector(maxDistancePx = 100f)
        assertFalse(detector.onTap(1_000, 200f, 300f))
        assertTrue(detector.onTap(1_250, 230f, 320f))
        // Un troisième toucher commence un nouveau double-tap.
        assertFalse(detector.onTap(1_400, 230f, 320f))
        // Trop lent, puis trop loin.
        assertFalse(detector.onTap(2_000, 230f, 320f))
        assertFalse(detector.onTap(2_600, 230f, 320f))
        assertFalse(detector.onTap(2_700, 500f, 320f))
        assertTrue(detector.onTap(2_900, 520f, 340f))
        assertEquals(LiveMode.IMAGE, LiveMode.fromKey("inconnu"))
        assertEquals(LiveMode.GRADIENT, LiveMode.fromKey("gradient"))
    }
}
