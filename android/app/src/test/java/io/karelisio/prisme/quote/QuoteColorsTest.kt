package io.karelisio.prisme.quote

import org.junit.Assert.assertEquals
import org.junit.Test

/** Les mêmes valeurs sont vérifiées côté app (layout.test.ts). */
class QuoteColorsTest {
    private fun argb(r: Int, g: Int, b: Int) = (0xFF shl 24) or (r shl 16) or (g shl 8) or b

    @Test
    fun `luminosite moyenne`() {
        assertEquals(0.5, QuoteColors.averageLuma(intArrayOf(argb(255, 255, 255), argb(0, 0, 0))), 1e-6)
        assertEquals(0.072925, QuoteColors.averageLuma(intArrayOf(argb(10, 20, 30))), 1e-6)
        assertEquals(0.273275, QuoteColors.averageLuma(intArrayOf(argb(200, 100, 50), argb(20, 40, 60), argb(255, 0, 0))), 1e-6)
        assertEquals(0.0, QuoteColors.averageLuma(intArrayOf()), 0.0)
    }

    @Test
    fun `l'opacite des pixels ne change rien`() {
        assertEquals(QuoteColors.averageLuma(intArrayOf(argb(10, 20, 30))), QuoteColors.averageLuma(intArrayOf(0x00 shl 24 or argb(10, 20, 30))), 1e-9)
    }

    @Test
    fun `texte clair sur fond sombre, sombre sur fond clair, ou couleur imposee`() {
        assertEquals(QuoteColors.Tone.LIGHT, QuoteColors.toneFor(QuoteColor.AUTO, 0.1))
        assertEquals(QuoteColors.Tone.LIGHT, QuoteColors.toneFor(QuoteColor.AUTO, 0.58))
        assertEquals(QuoteColors.Tone.DARK, QuoteColors.toneFor(QuoteColor.AUTO, 0.59))
        assertEquals(QuoteColors.Tone.LIGHT, QuoteColors.toneFor(QuoteColor.WHITE, 1.0))
        assertEquals(QuoteColors.Tone.DARK, QuoteColors.toneFor(QuoteColor.BLACK, 0.0))
    }

    @Test
    fun `voile plus fort quand le fond contredit le texte`() {
        assertEquals(0.14, QuoteColors.veilAlpha(QuoteColors.Tone.LIGHT, 0.1), 1e-6)
        assertEquals(0.253333, QuoteColors.veilAlpha(QuoteColors.Tone.LIGHT, 0.5), 1e-6)
        assertEquals(0.48, QuoteColors.veilAlpha(QuoteColors.Tone.LIGHT, 1.0), 1e-6)
        assertEquals(0.14, QuoteColors.veilAlpha(QuoteColors.Tone.DARK, 0.9), 1e-6)
        assertEquals(0.192889, QuoteColors.veilAlpha(QuoteColors.Tone.DARK, 0.58), 1e-6)
        assertEquals(0.48, QuoteColors.veilAlpha(QuoteColors.Tone.DARK, 0.2), 1e-6)
    }

    @Test
    fun `ombre douce de la couleur opposee`() {
        val light = QuoteColors.shadowOf(QuoteColors.Tone.LIGHT, 67.0)
        assertEquals(0.55, light.alpha, 1e-9)
        assertEquals(6.7, light.blur, 1e-9)
        assertEquals(2.345, light.dy, 1e-9)
        val dark = QuoteColors.shadowOf(QuoteColors.Tone.DARK, 67.0)
        assertEquals(0.45, dark.alpha, 1e-9)
        assertEquals(0.0, dark.dy, 0.0)
    }
}
