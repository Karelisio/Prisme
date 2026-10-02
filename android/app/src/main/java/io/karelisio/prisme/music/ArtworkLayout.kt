package io.karelisio.prisme.music

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Mise en page de la pochette sur l'écran : calculs purs, testés sur JVM (le dessin est dans [ArtworkComposer]). */
internal object ArtworkLayout {
    /** Largeur de la pochette nette, en fraction de la largeur de l'écran. */
    const val FOREGROUND_WIDTH = 0.72f

    /** Centre vertical de la pochette, en fraction de la hauteur de l'écran : un peu au-dessus du milieu. */
    const val CENTER_Y = 0.42f

    /** Hauteur maximale d'une pochette en hauteur, en fraction de celle de l'écran. */
    const val MAX_HEIGHT = 0.7f

    /** Marge minimale au-dessus et au-dessous de la pochette, en fraction de la hauteur de l'écran. */
    const val EDGE_MARGIN = 0.06f

    /** Rayon des coins, en fraction du petit côté de la pochette. */
    const val CORNER_RADIUS = 0.06f

    /** Flou de l'ombre et décalage vers le bas, en fraction de la largeur de l'écran. */
    const val SHADOW_BLUR = 0.04f
    const val SHADOW_OFFSET = 0.012f

    /** Part de noir ajoutée sur le fond flouté. */
    const val DIM = 0.35f

    /** Flou bon marché : réduction très forte, puis agrandissement filtré en deux étapes (écran divisé par ces facteurs). */
    const val BLUR_DIVISOR = 40
    const val BLUR_MIDDLE_DIVISOR = 8
    private const val MIN_SIDE = 8

    /** Rectangle en pixels ; droite et bas exclusifs. */
    data class Box(val left: Int, val top: Int, val width: Int, val height: Int) {
        val right: Int get() = left + width
        val bottom: Int get() = top + height
    }

    data class Size(val width: Int, val height: Int)

    data class Layout(
        /** Zone de la pochette qui couvre l'écran (recadrage centré) : base du fond flouté. */
        val backgroundSource: Box,
        /** Où la pochette nette est dessinée sur l'écran. */
        val foreground: Box,
        val cornerRadius: Float,
        val shadowBlur: Float,
        val shadowOffset: Float,
        /** Tailles des deux étapes du flou, de la plus petite à la plus grande. */
        val blurSmall: Size,
        val blurMiddle: Size,
    )

    fun compute(screenWidth: Int, screenHeight: Int, artWidth: Int, artHeight: Int): Layout {
        require(screenWidth > 0 && screenHeight > 0) { "Écran vide" }
        require(artWidth > 0 && artHeight > 0) { "Pochette vide" }

        // Fond : la pochette agrandie pour couvrir l'écran, donc recadrée au ratio de l'écran, au centre.
        val screenAspect = screenWidth.toDouble() / screenHeight
        val cropWidth: Int
        val cropHeight: Int
        if (artWidth.toDouble() / artHeight > screenAspect) {
            cropWidth = (artHeight * screenAspect).roundToInt()
            cropHeight = artHeight
        } else {
            cropWidth = artWidth
            cropHeight = (artWidth / screenAspect).roundToInt()
        }
        val cw = cropWidth.coerceIn(1, artWidth)
        val ch = cropHeight.coerceIn(1, artHeight)
        val background = Box((artWidth - cw) / 2, (artHeight - ch) / 2, cw, ch)

        // Premier plan : 72 % de la largeur, ratio d'origine ; une pochette très haute est ramenée à la hauteur permise.
        var width = screenWidth * FOREGROUND_WIDTH.toDouble()
        var height = width * artHeight / artWidth
        val maxHeight = screenHeight * MAX_HEIGHT.toDouble()
        if (height > maxHeight) {
            height = maxHeight
            width = height * artWidth / artHeight
        }
        val fw = max(1, width.roundToInt())
        val fh = max(1, height.roundToInt())
        val margin = (screenHeight * EDGE_MARGIN).roundToInt()
        val top = (screenHeight * CENTER_Y - fh / 2f).roundToInt().coerceIn(margin, max(margin, screenHeight - margin - fh))
        val foreground = Box((screenWidth - fw) / 2, top, fw, fh)

        val small = Size(max(MIN_SIDE, screenWidth / BLUR_DIVISOR), max(MIN_SIDE, screenHeight / BLUR_DIVISOR))
        val middle = Size(max(small.width, screenWidth / BLUR_MIDDLE_DIVISOR), max(small.height, screenHeight / BLUR_MIDDLE_DIVISOR))

        return Layout(
            backgroundSource = background,
            foreground = foreground,
            cornerRadius = min(fw, fh) * CORNER_RADIUS,
            shadowBlur = screenWidth * SHADOW_BLUR,
            shadowOffset = screenWidth * SHADOW_OFFSET,
            blurSmall = small,
            blurMiddle = middle,
        )
    }
}
