package io.karelisio.prisme.quote

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Les mêmes valeurs sont vérifiées côté app (layout.test.ts) : l'aperçu et le fond d'écran se dessinent de la même façon. */
class QuoteLayoutTest {
    private val nbsp = 0xA0.toChar()
    private val measure = QuoteLayout.Measure { text, size, role -> text.length * size * (if (role == QuoteLayout.Role.AUTHOR) 0.45 else 0.5) }
    private val style = QuoteStyle(QuoteFont.SERIF, QuotePosition.BOTTOM, QuoteSize.MEDIUM, QuoteColor.AUTO)
    private val chars: (String) -> Double = { it.length.toDouble() }
    private val text = "un deux trois quatre cinq six sept huit neuf dix"

    private fun plan(
        text: String,
        author: String? = null,
        style: QuoteStyle = this.style,
        screen: QuoteScreen = QuoteScreen.LOCK,
        width: Int = 1080,
        height: Int = 2400,
    ) = QuoteLayout.plan(text, author, style, screen, width, height, measure)

    private fun assertNear(expected: List<Double>, actual: List<Double>) {
        assertEquals(expected.size, actual.size)
        expected.forEachIndexed { i, v -> assertEquals(v, actual[i], 1e-3) }
    }

    @Test
    fun `typographie francaise`() {
        val expected = "Salut … «${nbsp}Ça va${nbsp}?${nbsp}» l’ami${nbsp}; ok${nbsp}: oui${nbsp}!"
        assertEquals(expected, QuoteLayout.typeset("  Salut   ...  « Ça va ? »  l'ami ; ok :  oui !  "))
        assertEquals("", QuoteLayout.typeset("\n\t"))
        assertEquals("un deux", QuoteLayout.typeset("un${nbsp}${0x202F.toChar()}deux"))
    }

    @Test
    fun `retours a la ligne au mot pres`() {
        assertEquals(listOf("un deux trois quatre", "cinq six sept huit", "neuf dix"), QuoteLayout.wrapLines(text, 20.0, chars))
        assertEquals(emptyList<String>(), QuoteLayout.wrapLines("", 20.0, chars))
        assertEquals(listOf("court"), QuoteLayout.wrapLines("court", 20.0, chars))
    }

    @Test
    fun `lignes equilibrees sans en ajouter`() {
        assertEquals(listOf("un deux trois", "quatre cinq six", "sept huit neuf dix"), QuoteLayout.balancedLines(text, 20.0, chars))
        assertEquals(listOf("court"), QuoteLayout.balancedLines("court", 20.0, chars))
    }

    @Test
    fun `mot plus large que la ligne coupe au caractere`() {
        assertEquals(listOf("abcd", "efgh", "ij", "kl"), QuoteLayout.wrapLines("abcdefghij kl", 4.0, chars))
    }

    @Test
    fun `points de suspension`() {
        assertEquals("bonjour t…", QuoteLayout.ellipsize("bonjour tout le monde", 10.0, chars, false))
        assertEquals("court", QuoteLayout.ellipsize("court", 10.0, chars, false))
        assertEquals("court…", QuoteLayout.ellipsize("court", 10.0, chars, true))
    }

    @Test
    fun `phrase courte au verrouillage, en bas`() {
        val p = plan("Petit à petit, l'oiseau fait son nid.")
        assertEquals(listOf("Petit à petit,", "l’oiseau fait son nid."), p.lines)
        assertEquals(66.96, p.fontSize, 1e-3)
        assertEquals(87.048, p.lineHeight, 1e-3)
        assertNull(p.author)
        assertEquals(540.0, p.centerX, 1e-9)
        assertEquals(864.0, p.maxWidth, 1e-3)
        assertEquals(1745.904, p.top, 1e-3)
        assertEquals(174.096, p.height, 1e-3)
        assertEquals(0.8 * 2400, p.top + p.height, 1e-3)
        assertNear(listOf(1812.864, 1899.912), p.baselines)
        assertFalse(p.truncated)
    }

    @Test
    fun `en haut du verrouillage, sous l'horloge, avec un auteur`() {
        val p = plan(
            "Il faut tourner sept fois sa langue dans sa bouche avant de parler.",
            author = "Proverbe",
            style = style.copy(position = QuotePosition.TOP, size = QuoteSize.LARGE),
        )
        assertEquals(listOf("Il faut tourner", "sept fois sa langue", "dans sa bouche", "avant de parler."), p.lines)
        assertEquals(82.08, p.fontSize, 1e-3)
        assertEquals("— Proverbe", p.author)
        assertEquals(49.248, p.authorSize, 1e-3)
        assertEquals(816.0, p.top, 1e-3)
        assertEquals(531.8784, p.height, 1e-3)
        assertNear(listOf(898.08, 1004.784, 1111.488, 1218.192), p.baselines)
        assertEquals(1333.104, p.authorBaseline, 1e-3)
    }

    @Test
    fun `texte trop long, retreci puis coupe, au centre de l'accueil`() {
        val p = plan(
            "Un texte vraiment très long ".repeat(12) + "fin ; vraiment !",
            author = "Moi",
            style = style.copy(position = QuotePosition.CENTER, size = QuoteSize.LARGE),
            screen = QuoteScreen.HOME,
        )
        assertEquals(50.8896, p.fontSize, 1e-3)
        assertEquals(11, p.lines.size)
        assertEquals("Un texte vraiment très long…", p.lines[10])
        assertTrue(p.truncated)
        assertEquals(803.570016, p.top, 1e-3)
        assertEquals(792.859968, p.height, 1e-3)
        assertTrue(p.height <= 2400 * 0.34)
        assertEquals(1587.269856, p.authorBaseline, 1e-3)
    }

    @Test
    fun `mot plus large que la ligne coupe au caractere dans le plan`() {
        val p = plan(
            "Anticonstitutionnellement " + "x".repeat(80),
            style = style.copy(position = QuotePosition.TOP, size = QuoteSize.SMALL),
            screen = QuoteScreen.HOME,
            width = 540,
            height = 1200,
        )
        assertEquals(27.0, p.fontSize, 1e-3)
        assertEquals(4, p.lines.size)
        assertTrue(p.lines.all { it.length * 27 * 0.5 <= p.maxWidth })
        assertEquals(120.0, p.top, 1e-3)
    }

    @Test
    fun `un mot, en bas d'un petit ecran d'accueil`() {
        val p = plan("Bonjour", style = style.copy(size = QuoteSize.SMALL), screen = QuoteScreen.HOME, width = 720, height = 1280)
        assertEquals(listOf("Bonjour"), p.lines)
        assertEquals(36.0, p.fontSize, 1e-3)
        assertEquals(977.2, p.top, 1e-3)
        assertEquals(1013.2, p.baselines[0], 1e-3)
    }

    @Test
    fun `reste dans l'ecran sans masquer l'horloge du verrouillage`() {
        val texts = listOf("Court.", "Une phrase un peu plus longue qui passera sur deux ou trois lignes.", "mot ".repeat(60))
        for ((w, h) in listOf(1080 to 2400, 720 to 1280, 1440 to 3200, 480 to 800)) {
            for (text in texts) {
                for (position in QuotePosition.entries) {
                    for (screen in QuoteScreen.entries) {
                        val p = plan(text, "Auteur", style.copy(position = position, size = QuoteSize.LARGE), screen, w, h)
                        val label = "${w}x$h $screen $position"
                        assertTrue(label, p.top >= h * 0.06 - 1e-6)
                        assertTrue(label, p.top + p.height <= h * 0.94 + 1e-6)
                        assertTrue(label, p.height <= h * 0.34 + 1e-6)
                        if (screen == QuoteScreen.LOCK && position == QuotePosition.TOP) assertTrue(label, p.top >= h * 0.34 - 1e-6)
                    }
                }
            }
        }
    }

    @Test
    fun `zone mesuree et voile`() {
        val p = plan("Petit à petit, l'oiseau fait son nid.")
        assertEquals(QuoteLayout.Box(108, 1745, 972, 1920), QuoteLayout.sampleBox(p, 1080, 2400))
        val band = QuoteColors.veilBand(p, 2400)
        assertEquals(1665.552, band.top, 1e-3)
        assertEquals(2000.352, band.bottom, 1e-3)
        assertEquals(0.0, QuoteColors.veilBand(p.copy(top = 10.0), 2400).top, 1e-9)
    }

    @Test
    fun `grille de points au centre des cases`() {
        val points = QuoteLayout.samplePoints(QuoteLayout.Box(108, 1745, 972, 1920), 2)
        assertEquals(listOf(324 to 1788, 756 to 1788, 324 to 1876, 756 to 1876), points.map { it.x to it.y })
        // Une zone étroite répète ses pixels sans en sortir.
        val narrow = QuoteLayout.samplePoints(QuoteLayout.Box(0, 0, 3, 2), 4).map { "${it.x},${it.y}" }
        assertEquals(
            listOf("0,0", "1,0", "1,0", "2,0", "0,0", "1,0", "1,0", "2,0", "0,1", "1,1", "1,1", "2,1", "0,1", "1,1", "1,1", "2,1"),
            narrow,
        )
        assertEquals(emptyList<QuoteLayout.Point>(), QuoteLayout.samplePoints(QuoteLayout.Box(5, 5, 5, 9)))
        assertEquals(24 * 24, QuoteLayout.samplePoints(QuoteLayout.Box(0, 0, 100, 100)).size)
    }
}
