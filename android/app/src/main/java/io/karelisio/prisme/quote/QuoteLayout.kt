package io.karelisio.prisme.quote

import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Mise en page de la phrase sur le fond d'écran : retours à la ligne, taille et position. Calculs purs, testés
 * sur JVM (la mesure du texte est fournie par l'appelant, le dessin est dans [QuoteRenderer]). Ce sont les mêmes
 * que ceux de l'aperçu de l'app (src/features/quote/layout.ts), avec les mêmes constantes : les mêmes valeurs
 * d'essai sont vérifiées des deux côtés, toute modification doit être reportée dans l'autre langage.
 */
internal object QuoteLayout {
    /** Largeur maximale des lignes, en fraction de la largeur de l'écran. */
    const val MAX_WIDTH = 0.8

    /** Hauteur maximale du bloc (texte et auteur), en fraction de la hauteur de l'écran. */
    const val MAX_BLOCK = 0.34

    /** Le texte rétrécit (de 8 % à chaque pas) jusqu'à cette part de sa taille d'origine, puis il est coupé. */
    const val MIN_SCALE = 0.62
    const val SHRINK = 0.92
    const val LINE_HEIGHT = 1.3
    const val MAX_LINES = 12

    /** Taille de l'auteur et espace qui le sépare du texte, en fraction du corps du texte. */
    const val AUTHOR_SCALE = 0.6
    const val AUTHOR_GAP = 0.5

    /** Marge haute et basse à ne jamais dépasser, en fraction de la hauteur de l'écran. */
    const val EDGE_MARGIN = 0.06

    /** Nombre de points mesurés par côté dans la zone du texte. */
    const val SAMPLES = 24

    /**
     * Repères verticaux (fraction de la hauteur) : haut du bloc pour « haut », milieu pour « centre », bas du bloc
     * pour « bas ». Au verrouillage, « haut » commence sous l'horloge ; l'accueil a sa barre d'état et son dock.
     */
    fun zone(screen: QuoteScreen, position: QuotePosition): Double = when (screen) {
        QuoteScreen.LOCK -> when (position) {
            QuotePosition.TOP -> 0.34
            QuotePosition.CENTER -> 0.5
            QuotePosition.BOTTOM -> 0.8
        }
        QuoteScreen.HOME -> when (position) {
            QuotePosition.TOP -> 0.1
            QuotePosition.CENTER -> 0.5
            QuotePosition.BOTTOM -> 0.8
        }
    }

    /** Texte ou ligne de l'auteur : les deux n'ont pas la même police. */
    enum class Role { TEXT, AUTHOR }

    /** Mesure de la largeur d'un texte, en pixels, à la taille [size]. */
    fun interface Measure {
        fun width(text: String, size: Double, role: Role): Double
    }

    data class Plan(
        val lines: List<String>,
        val fontSize: Double,
        val lineHeight: Double,
        /** Ligne de l'auteur (« — Nom »), null s'il n'y en a pas. */
        val author: String?,
        val authorSize: Double,
        /** Abscisse du centre des lignes. */
        val centerX: Double,
        val maxWidth: Double,
        val top: Double,
        val height: Double,
        /** Ligne de base de chaque ligne de texte. */
        val baselines: List<Double>,
        val authorBaseline: Double,
        /** Le texte a été coupé : même rétréci, il ne tenait pas dans le bloc. */
        val truncated: Boolean,
    )

    /** Rectangle en pixels ; droite et bas exclusifs. */
    data class Box(val left: Int, val top: Int, val right: Int, val bottom: Int)

    data class Point(val x: Int, val y: Int)

    private val NBSP: Char = 0xA0.toChar()

    /** Espaces d'un texte saisi : les mêmes que ceux que reconnaît l'app. */
    private val SPACES = Regex("[ \\t\\n\\r\\f\\x0B\\x{A0}\\x{2000}-\\x{200A}\\x{202F}\\x{205F}\\x{3000}]+")
    private val EDGE_SPACE = Regex("^ | $")
    private val BEFORE_PUNCTUATION = Regex(" ([:;!?»])")
    private val AFTER_OPENING_QUOTE = Regex("« ")

    /**
     * Typographie française : espaces simplifiées, apostrophes courbes, points de suspension, espace insécable
     * avant « : ; ! ? » et autour des guillemets, pour qu'une ligne ne commence jamais par une ponctuation.
     */
    fun typeset(text: String): String = text
        .replace(SPACES, " ")
        .replace(EDGE_SPACE, "")
        .replace('\'', '’')
        .replace("...", "…")
        .replace(BEFORE_PUNCTUATION) { "$NBSP${it.groupValues[1]}" }
        .replace(AFTER_OPENING_QUOTE, "«$NBSP")

    /** Retour à la ligne au mot près ; un mot plus large que la ligne est coupé au caractère près. */
    fun wrapLines(text: String, maxWidth: Double, measure: (String) -> Double): List<String> {
        val lines = ArrayList<String>()
        var line = ""
        for (word in text.split(' ')) {
            if (word.isEmpty()) continue
            if (line.isNotEmpty()) {
                val joined = "$line $word"
                if (measure(joined) <= maxWidth) {
                    line = joined
                    continue
                }
                lines.add(line)
                line = ""
            }
            if (measure(word) <= maxWidth) {
                line = word
                continue
            }
            var chunk = ""
            for (char in codePoints(word)) {
                if (chunk.isNotEmpty() && measure(chunk + char) > maxWidth) {
                    lines.add(chunk)
                    chunk = ""
                }
                chunk += char
            }
            line = chunk
        }
        if (line.isNotEmpty()) lines.add(line)
        return lines
    }

    /** Les caractères de [word], une paire de substitution (emoji…) restant d'un seul tenant. */
    private fun codePoints(word: String): List<String> {
        val out = ArrayList<String>(word.length)
        var i = 0
        while (i < word.length) {
            val size = Character.charCount(word.codePointAt(i))
            out.add(word.substring(i, i + size))
            i += size
        }
        return out
    }

    /**
     * Comme [wrapLines], mais sur la largeur la plus étroite qui garde le même nombre de lignes : des lignes de
     * longueurs voisines, sans mot isolé sur la dernière.
     */
    fun balancedLines(text: String, maxWidth: Double, measure: (String) -> Double): List<String> {
        val greedy = wrapLines(text, maxWidth, measure)
        if (greedy.size < 2) return greedy
        var low = 0.0
        var high = maxWidth
        repeat(12) {
            val middle = (low + high) / 2
            if (wrapLines(text, middle, measure).size == greedy.size) high = middle else low = middle
        }
        return wrapLines(text, high, measure)
    }

    /** Raccourcit [line] pour qu'elle tienne avec « … » ; [force] ajoute les points de suspension même si elle tient. */
    fun ellipsize(line: String, maxWidth: Double, measure: (String) -> Double, force: Boolean): String {
        if (!force && measure(line) <= maxWidth) return line
        var kept = line
        while (kept.isNotEmpty() && measure("$kept…") > maxWidth) kept = kept.dropLast(1).trimEnd()
        return "$kept…"
    }

    private fun blockHeight(lineCount: Int, size: Double, hasAuthor: Boolean): Double {
        val authorSize = size * AUTHOR_SCALE
        return lineCount * size * LINE_HEIGHT + if (hasAuthor) size * AUTHOR_GAP + authorSize * LINE_HEIGHT else 0.0
    }

    /** Place la phrase sur un écran de [width] × [height] pixels. */
    fun plan(
        text: String,
        author: String?,
        style: QuoteStyle,
        screen: QuoteScreen,
        width: Int,
        height: Int,
        measure: Measure,
    ): Plan {
        val body = typeset(text)
        val authorName = typeset(author.orEmpty())
        val hasAuthor = authorName.isNotEmpty()
        val screenWidth = width.toDouble()
        val screenHeight = height.toDouble()
        val maxWidth = screenWidth * MAX_WIDTH
        val base = screenWidth * style.size.factor
        val maxBlock = screenHeight * MAX_BLOCK

        var size = base
        var lines: List<String>
        while (true) {
            val current = size
            lines = balancedLines(body, maxWidth) { measure.width(it, current, Role.TEXT) }
            if ((lines.size <= MAX_LINES && blockHeight(lines.size, size, hasAuthor) <= maxBlock) || size <= base * MIN_SCALE) break
            size = max(base * MIN_SCALE, size * SHRINK)
        }

        val lineHeight = size * LINE_HEIGHT
        val authorSize = size * AUTHOR_SCALE
        val finalSize = size
        val room = floor((maxBlock - blockHeight(0, size, hasAuthor)) / lineHeight).toInt()
        val allowed = max(1, min(MAX_LINES, room))
        var truncated = false
        if (lines.size > allowed) {
            truncated = true
            val kept = lines.take(allowed).toMutableList()
            val last = kept.size - 1
            kept[last] = ellipsize(kept[last], maxWidth, { measure.width(it, finalSize, Role.TEXT) }, true)
            lines = kept
        }
        val authorLine = if (hasAuthor) ellipsize("— $authorName", maxWidth, { measure.width(it, authorSize, Role.AUTHOR) }, false) else null

        val blockH = blockHeight(lines.size, size, hasAuthor)
        val anchor = zone(screen, style.position) * screenHeight
        val wanted = when (style.position) {
            QuotePosition.TOP -> anchor
            QuotePosition.CENTER -> anchor - blockH / 2
            QuotePosition.BOTTOM -> anchor - blockH
        }
        val margin = screenHeight * EDGE_MARGIN
        val top = min(max(wanted, margin), max(margin, screenHeight - margin - blockH))

        val baselines = lines.indices.map { top + it * lineHeight + size }
        val authorTop = top + lines.size * lineHeight + size * AUTHOR_GAP
        return Plan(
            lines = lines,
            fontSize = size,
            lineHeight = lineHeight,
            author = authorLine,
            authorSize = authorSize,
            centerX = screenWidth / 2,
            maxWidth = maxWidth,
            top = top,
            height = blockH,
            baselines = baselines,
            authorBaseline = authorTop + authorSize,
            truncated = truncated,
        )
    }

    /** Zone de l'écran, en pixels entiers, où se pose le texte : celle dont on mesure la luminosité. */
    fun sampleBox(plan: Plan, width: Int, height: Int): Box {
        fun clamp(v: Double, limit: Int) = min(max(v, 0.0), limit.toDouble()).toInt()
        return Box(
            left = clamp(floor(plan.centerX - plan.maxWidth / 2), width),
            top = clamp(floor(plan.top), height),
            right = clamp(ceil(plan.centerX + plan.maxWidth / 2), width),
            bottom = clamp(ceil(plan.top + plan.height), height),
        )
    }

    /** Points à mesurer dans [box] : une grille de [n] × [n] pixels, au centre de ses cases. */
    fun samplePoints(box: Box, n: Int = SAMPLES): List<Point> {
        val width = box.right - box.left
        val height = box.bottom - box.top
        if (width <= 0 || height <= 0) return emptyList()
        val points = ArrayList<Point>(n * n)
        for (j in 0 until n) {
            for (i in 0 until n) {
                points.add(
                    Point(
                        box.left + min(width - 1, floor((i + 0.5) * width / n).toInt()),
                        box.top + min(height - 1, floor((j + 0.5) * height / n).toInt()),
                    ),
                )
            }
        }
        return points
    }
}
