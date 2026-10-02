package io.karelisio.prisme.live

import io.karelisio.prisme.wallpaper.PixelRect
import org.json.JSONObject
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Réglages et calculs du relief 3D (purs, testés sur JVM). */
internal object ReliefMath {
    /** Marge de l'image préparée autour de l'écran (fraction de chaque côté) : la course des plans. */
    const val MARGIN = 0.08f

    const val DEFAULT_DEPTH = 0.5f

    /** Force minimale de l'effet (profondeur 0) : le relief reste perceptible. */
    private const val MIN_STRENGTH = 0.2f

    /** Part de la course parcourue par l'arrière-plan ; le sujet la parcourt en entier. */
    const val BACKGROUND_TRAVEL = 0.3f

    /** Agrandissement du sujet à pleine force. */
    const val SUBJECT_ZOOM = 0.03f

    /** Décalage de l'ombre vers le bas à pleine force (fraction de la hauteur de l'écran). */
    const val SHADOW_DROP = 0.008f

    /** Plus grand côté de l'image de travail (détourage, comblement). */
    const val WORK_MAX_SIDE = 1280

    /** Part minimale de l'image occupée par le sujet : en dessous, aucun sujet n'est retenu. */
    const val MIN_COVERAGE = 0.01f

    /** Force de l'effet (0..1) pour la profondeur réglée (0..1). */
    fun strength(depth: Float): Float {
        val d = if (depth.isNaN()) DEFAULT_DEPTH else depth.coerceIn(0f, 1f)
        return MIN_STRENGTH + (1 - MIN_STRENGTH) * d
    }

    /** Taille de travail : l'image réduite pour que son plus grand côté ne dépasse pas [maxSide]. */
    fun workSize(width: Int, height: Int, maxSide: Int = WORK_MAX_SIDE): Pair<Int, Int> {
        val scale = min(1f, maxSide.toFloat() / max(width, height))
        return max(1, (width * scale).roundToInt()) to max(1, (height * scale).roundToInt())
    }

    /**
     * Élargissement de la zone comblée autour du sujet, en pixels de travail (environ 0,8 % du petit côté) :
     * couvre l'incertitude du détourage et les bords adoucis, sans trop étendre le flou autour du sujet.
     */
    fun growRadius(workWidth: Int, workHeight: Int): Int = max(3, ceil(min(workWidth, workHeight) * 0.008f).toInt())

    /** Échelle à laquelle une image [imageWidth]×[imageHeight] couvre l'écran plus la marge. */
    fun coverScale(screenWidth: Int, screenHeight: Int, imageWidth: Int, imageHeight: Int, margin: Float = MARGIN): Float {
        if (imageWidth <= 0 || imageHeight <= 0) return 1f
        return max(screenWidth * (1 + 2 * margin) / imageWidth, screenHeight * (1 + 2 * margin) / imageHeight)
    }

    /**
     * Rectangle [box] de l'image de travail ([fromWidth]×[fromHeight]) ramené à l'image pleine taille
     * ([toWidth]×[toHeight]), élargi de [pad] px et contenu dans l'image.
     */
    fun scaleBox(box: PixelRect, fromWidth: Int, fromHeight: Int, toWidth: Int, toHeight: Int, pad: Int): PixelRect {
        val sx = toWidth.toFloat() / fromWidth
        val sy = toHeight.toFloat() / fromHeight
        return PixelRect(
            (floor(box.left * sx).toInt() - pad).coerceIn(0, toWidth - 1),
            (floor(box.top * sy).toInt() - pad).coerceIn(0, toHeight - 1),
            (ceil(box.right * sx).toInt() + pad).coerceIn(1, toWidth),
            (ceil(box.bottom * sy).toInt() + pad).coerceIn(1, toHeight),
        )
    }
}

/** Réglages de la scène « Relief 3D », envoyés par l'app (`scene_relief`). */
internal data class ReliefSettings(
    /** Profondeur de l'effet, de 0 (subtile) à 1 (prononcée). */
    val depth: Float = ReliefMath.DEFAULT_DEPTH,
    /** Ombre douce du sujet sur l'arrière-plan. */
    val shadow: Boolean = true,
) {
    companion object {
        fun from(json: JSONObject): ReliefSettings {
            val depth = json.optDouble("depth", ReliefMath.DEFAULT_DEPTH.toDouble())
            return ReliefSettings(
                depth = if (depth.isNaN()) ReliefMath.DEFAULT_DEPTH else depth.toFloat().coerceIn(0f, 1f),
                shadow = json.optBoolean("shadow", true),
            )
        }
    }
}

/**
 * Position des deux plans du relief à l'écran (calcul pur, sans allocation à chaque image, testé sur JVM).
 * Au repos, l'image préparée (écran plus marge) est centrée. Selon l'inclinaison, l'arrière-plan glisse un
 * peu et le sujet, très légèrement agrandi, davantage, à l'opposé de l'inclinaison comme la photo avec
 * parallaxe ; le sujet ne glisse jamais plus que la marge, pour que ses bords coupés par le cadre de la
 * photo restent hors de l'écran. L'ombre, posée sur l'arrière-plan, le suit.
 */
internal class ReliefLayout {
    /** Rectangles à l'écran : gauche, haut, droite, bas. */
    val background = FloatArray(4)
    val subject = FloatArray(4)
    val shadow = FloatArray(4)

    /** Course du sujet (px) pour une inclinaison maximale : un mouvement plus petit qu'un pixel ne se voit pas. */
    var subjectTravelX = 0f
        private set
    var subjectTravelY = 0f
        private set

    private var scale = 1f
    private var drawnWidth = 0f
    private var drawnHeight = 0f
    private var baseLeft = 0f
    private var baseTop = 0f
    private var backgroundTravelX = 0f
    private var backgroundTravelY = 0f
    private var zoom = 1f
    private var centerX = 0f
    private var centerY = 0f
    private var halfWidth = 0f
    private var halfHeight = 0f
    private var shadowPad = 0f
    private var shadowDrop = 0f

    /**
     * Écran [screenWidth]×[screenHeight] ; image préparée [imageWidth]×[imageHeight] ; sujet placé en
     * ([subjectLeft], [subjectTop]) dans l'image, de taille [subjectWidth]×[subjectHeight] (0 : pas de
     * sujet) ; ombre débordant du sujet de [shadowPad] px d'image ; profondeur réglée [depth].
     */
    fun configure(
        screenWidth: Int,
        screenHeight: Int,
        imageWidth: Int,
        imageHeight: Int,
        subjectLeft: Int,
        subjectTop: Int,
        subjectWidth: Int,
        subjectHeight: Int,
        shadowPad: Float,
        depth: Float,
    ) {
        scale = ReliefMath.coverScale(screenWidth, screenHeight, imageWidth, imageHeight)
        drawnWidth = imageWidth * scale
        drawnHeight = imageHeight * scale
        baseLeft = (screenWidth - drawnWidth) / 2f
        baseTop = (screenHeight - drawnHeight) / 2f
        val marginX = max(0f, -baseLeft)
        val marginY = max(0f, -baseTop)
        val strength = ReliefMath.strength(depth)
        subjectTravelX = marginX * strength
        subjectTravelY = marginY * strength
        backgroundTravelX = subjectTravelX * ReliefMath.BACKGROUND_TRAVEL
        backgroundTravelY = subjectTravelY * ReliefMath.BACKGROUND_TRAVEL
        zoom = 1f + ReliefMath.SUBJECT_ZOOM * strength
        halfWidth = subjectWidth / 2f
        halfHeight = subjectHeight / 2f
        centerX = subjectLeft + halfWidth
        centerY = subjectTop + halfHeight
        this.shadowPad = shadowPad
        shadowDrop = screenHeight * ReliefMath.SHADOW_DROP * strength
        update(0f, 0f)
    }

    /** Positions pour l'inclinaison normalisée ([normalizedX], [normalizedY], de -1 à 1). */
    fun update(normalizedX: Float, normalizedY: Float) {
        val nx = normalizedX.coerceIn(-1f, 1f)
        val ny = normalizedY.coerceIn(-1f, 1f)
        val backgroundLeft = baseLeft - nx * backgroundTravelX
        val backgroundTop = baseTop - ny * backgroundTravelY
        background[0] = backgroundLeft
        background[1] = backgroundTop
        background[2] = backgroundLeft + drawnWidth
        background[3] = backgroundTop + drawnHeight
        place(subject, baseLeft - nx * subjectTravelX, baseTop - ny * subjectTravelY, halfWidth, halfHeight, 0f)
        place(shadow, backgroundLeft, backgroundTop, halfWidth + shadowPad, halfHeight + shadowPad, shadowDrop)
    }

    /** Rectangle du sujet (ou de son ombre), agrandi autour de son centre, pour un plan placé en ([left], [top]). */
    private fun place(out: FloatArray, left: Float, top: Float, halfW: Float, halfH: Float, drop: Float) {
        out[0] = left + scale * (centerX - zoom * halfW)
        out[1] = top + scale * (centerY - zoom * halfH) + drop
        out[2] = left + scale * (centerX + zoom * halfW)
        out[3] = top + scale * (centerY + zoom * halfH) + drop
    }
}
