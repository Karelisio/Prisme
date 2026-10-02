package io.karelisio.prisme.live

import io.karelisio.prisme.wallpaper.PixelRect
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Masques du relief 3D, calculés sur des tableaux ligne après ligne (purs, testés sur JVM) : confiance du
 * détourage (0..1 par pixel), alpha adouci du sujet, zone de l'arrière-plan à combler, ombre du sujet.
 */
internal object ReliefMask {
    /** Confiance à partir de laquelle un pixel appartient au sujet. */
    const val SUBJECT_THRESHOLD = 0.5f

    /** Confiance à partir de laquelle un pixel est retiré de l'arrière-plan (sujet même incertain : cheveux…). */
    const val HOLE_THRESHOLD = 0.2f

    /** Bornes du contraste de la confiance pour l'alpha du sujet. */
    private const val EDGE_LOW = 0.3f
    private const val EDGE_HIGH = 0.7f

    /** Alpha d'une couleur opaque (0xFF000000). */
    const val OPAQUE = -0x1000000

    /** Décalages du rouge, du vert et du bleu dans une couleur ARGB. */
    private val CHANNEL_SHIFTS = intArrayOf(16, 8, 0)

    /** Part de l'image (0..1) occupée par le sujet. */
    fun coverage(confidence: FloatArray): Float {
        if (confidence.isEmpty()) return 0f
        var count = 0
        for (c in confidence) if (c >= SUBJECT_THRESHOLD) count++
        return count.toFloat() / confidence.size
    }

    /** Rectangle des valeurs supérieures à [threshold] (droite et bas exclus), ou null s'il n'y en a aucune. */
    fun bounds(values: FloatArray, width: Int, height: Int, threshold: Float = 0f): PixelRect? {
        var left = width
        var top = -1
        var right = -1
        var bottom = -1
        for (y in 0 until height) {
            val row = y * width
            var first = -1
            var last = -1
            for (x in 0 until width) {
                if (values[row + x] > threshold) {
                    if (first < 0) first = x
                    last = x
                }
            }
            if (first < 0) continue
            if (top < 0) top = y
            bottom = y
            left = min(left, first)
            right = max(right, last)
        }
        return if (top < 0) null else PixelRect(left, top, right + 1, bottom + 1)
    }

    fun smoothstep(edge0: Float, edge1: Float, x: Float): Float {
        val t = ((x - edge0) / (edge1 - edge0)).coerceIn(0f, 1f)
        return t * t * (3 - 2 * t)
    }

    /** 1 là où la confiance atteint [threshold], 0 ailleurs. */
    fun binary(confidence: FloatArray, threshold: Float): FloatArray =
        FloatArray(confidence.size) { if (confidence[it] >= threshold) 1f else 0f }

    /** Dilatation : chaque valeur devient le maximum de son voisinage carré de rayon [radius]. */
    fun dilate(src: FloatArray, width: Int, height: Int, radius: Int): FloatArray = extreme(src, width, height, radius, keepMax = true)

    /** Érosion : chaque valeur devient le minimum de son voisinage carré de rayon [radius]. */
    fun erode(src: FloatArray, width: Int, height: Int, radius: Int): FloatArray = extreme(src, width, height, radius, keepMax = false)

    /** Minimum ou maximum glissant, en deux passes (lignes puis colonnes). */
    private fun extreme(src: FloatArray, width: Int, height: Int, radius: Int, keepMax: Boolean): FloatArray {
        if (radius <= 0) return src.copyOf()
        val rows = FloatArray(src.size)
        for (y in 0 until height) extremeLine(src, rows, y * width, 1, width, radius, keepMax)
        val out = FloatArray(src.size)
        for (x in 0 until width) extremeLine(rows, out, x, width, height, radius, keepMax)
        return out
    }

    private fun extremeLine(src: FloatArray, dst: FloatArray, start: Int, step: Int, n: Int, radius: Int, keepMax: Boolean) {
        for (i in 0 until n) {
            var value = src[start + i * step]
            val to = min(n - 1, i + radius)
            for (k in max(0, i - radius)..to) {
                val other = src[start + k * step]
                if (if (keepMax) other > value else other < value) value = other
            }
            dst[start + i * step] = value
        }
    }

    /** Flou « boîte » séparable de rayon [radius] (moyenne sur 2r+1 valeurs), bords prolongés. */
    fun boxBlur(src: FloatArray, width: Int, height: Int, radius: Int): FloatArray {
        if (radius <= 0) return src.copyOf()
        val rows = FloatArray(src.size)
        for (y in 0 until height) blurLine(src, rows, y * width, 1, width, radius)
        val out = FloatArray(src.size)
        for (x in 0 until width) blurLine(rows, out, x, width, height, radius)
        return out
    }

    /** Moyenne glissante (somme cumulée : un ajout et un retrait par valeur). */
    private fun blurLine(src: FloatArray, dst: FloatArray, start: Int, step: Int, n: Int, radius: Int) {
        val last = n - 1
        val norm = 1f / (2 * radius + 1)
        var sum = 0f
        for (k in -radius..radius) sum += src[start + k.coerceIn(0, last) * step]
        for (i in 0 until n) {
            dst[start + i * step] = sum * norm
            sum += src[start + min(last, i + radius + 1) * step] - src[start + max(0, i - radius) * step]
        }
    }

    /**
     * Alpha du sujet (0..1) : confiance contrastée, resserrée de [shrink] px (le fond d'origine reste hors
     * du sujet découpé) puis bords adoucis sur [feather] px de chaque côté du contour resserré.
     */
    fun subjectAlpha(confidence: FloatArray, width: Int, height: Int, shrink: Int, feather: Int): FloatArray {
        val sharp = FloatArray(confidence.size) { smoothstep(EDGE_LOW, EDGE_HIGH, confidence[it]) }
        val inner = erode(sharp, width, height, shrink)
        val soft = boxBlur(inner, width, height, feather)
        // Arrondis du flou : rien d'infime hors du sujet, rien de presque opaque en son centre.
        for (i in soft.indices) soft[i] = if (soft[i] < 0.004f) 0f else if (soft[i] > 0.996f) 1f else soft[i]
        return soft
    }

    /**
     * Zone de l'arrière-plan à combler : le sujet, même incertain, élargi de [grow] px pour qu'aucun bout de
     * contour ne reste visible derrière lui quand il se décale (1 dans la zone, 0 ailleurs).
     */
    fun hole(confidence: FloatArray, width: Int, height: Int, grow: Int): FloatArray =
        dilate(binary(confidence, HOLE_THRESHOLD), width, height, grow)

    /**
     * Ombre du sujet : son alpha [alpha] (0..255) flouté sur environ [radius] px, dans une image agrandie de
     * [radius] px de chaque côté ; pixels ARGB noirs d'opacité variable.
     */
    fun shadow(alpha: IntArray, width: Int, height: Int, radius: Int): IntArray {
        val r = max(1, radius)
        val outW = width + 2 * r
        val outH = height + 2 * r
        val values = FloatArray(outW * outH)
        for (y in 0 until height) {
            val src = y * width
            val dst = (y + r) * outW + r
            for (x in 0 until width) values[dst + x] = alpha[src + x].coerceIn(0, 255) / 255f
        }
        // Deux flous « boîte » de demi-rayon : un profil adouci, proche d'un flou gaussien.
        val half = max(1, r / 2)
        val blurred = boxBlur(boxBlur(values, outW, outH, half), outW, outH, half)
        return IntArray(blurred.size) { (blurred[it].coerceIn(0f, 1f) * 255f).roundToInt() shl 24 }
    }

    /**
     * Adoucit les couleurs [pixels] (ARGB opaques) là où [weight] > 0 : mélange avec leur flou de rayon
     * [radius], proportionnel au poids. Renvoie une nouvelle image ; ailleurs, les pixels ne changent pas.
     */
    fun blurInside(pixels: IntArray, width: Int, height: Int, weight: FloatArray, radius: Int): IntArray {
        val out = pixels.copyOf()
        if (radius <= 0) return out
        // Une couleur à la fois : la mémoire reste bornée à quelques tableaux de la taille de l'image.
        for (shift in CHANNEL_SHIFTS) {
            val channel = FloatArray(pixels.size) { ((pixels[it] shr shift) and 0xFF).toFloat() }
            val blurred = boxBlur(channel, width, height, radius)
            val clear = (0xFF shl shift).inv()
            for (i in pixels.indices) {
                val t = weight[i]
                if (t <= 0f) continue
                val value = (channel[i] + (blurred[i] - channel[i]) * min(1f, t)).roundToInt().coerceIn(0, 255)
                out[i] = (out[i] and clear) or (value shl shift)
            }
        }
        return out
    }

    /**
     * Valeur de [values] (largeur [width], hauteur [height]) au point ([u], [v]), en pixels dont les centres
     * sont aux coordonnées entières : interpolation bilinéaire, bords prolongés.
     */
    fun sample(values: FloatArray, width: Int, height: Int, u: Float, v: Float): Float {
        val x = u.coerceIn(0f, (width - 1).toFloat())
        val y = v.coerceIn(0f, (height - 1).toFloat())
        val x0 = x.toInt()
        val y0 = y.toInt()
        val x1 = min(x0 + 1, width - 1)
        val y1 = min(y0 + 1, height - 1)
        val tx = x - x0
        val ty = y - y0
        val top = values[y0 * width + x0] + (values[y0 * width + x1] - values[y0 * width + x0]) * tx
        val bottom = values[y1 * width + x0] + (values[y1 * width + x1] - values[y1 * width + x0]) * tx
        return top + (bottom - top) * ty
    }

    /** Couleur (ARGB opaque) de [pixels] au point ([u], [v]), comme [sample]. */
    fun sampleColor(pixels: IntArray, width: Int, height: Int, u: Float, v: Float): Int {
        val x = u.coerceIn(0f, (width - 1).toFloat())
        val y = v.coerceIn(0f, (height - 1).toFloat())
        val x0 = x.toInt()
        val y0 = y.toInt()
        val x1 = min(x0 + 1, width - 1)
        val y1 = min(y0 + 1, height - 1)
        val tx = x - x0
        val ty = y - y0
        val c00 = pixels[y0 * width + x0]
        val c10 = pixels[y0 * width + x1]
        val c01 = pixels[y1 * width + x0]
        val c11 = pixels[y1 * width + x1]
        return rgb(
            bilinear(c00 shr 16, c10 shr 16, c01 shr 16, c11 shr 16, tx, ty),
            bilinear(c00 shr 8, c10 shr 8, c01 shr 8, c11 shr 8, tx, ty),
            bilinear(c00, c10, c01, c11, tx, ty),
        )
    }

    /** Mélange de deux couleurs opaques : [t] = 0 donne [from], 1 donne [to]. */
    fun mix(from: Int, to: Int, t: Float): Int {
        if (t <= 0f) return from or OPAQUE
        if (t >= 1f) return to or OPAQUE
        return rgb(
            channel(from, 16) + (channel(to, 16) - channel(from, 16)) * t,
            channel(from, 8) + (channel(to, 8) - channel(from, 8)) * t,
            channel(from, 0) + (channel(to, 0) - channel(from, 0)) * t,
        )
    }

    private fun channel(color: Int, shift: Int): Float = ((color shr shift) and 0xFF).toFloat()

    private fun bilinear(c00: Int, c10: Int, c01: Int, c11: Int, tx: Float, ty: Float): Float {
        val top = (c00 and 0xFF) + ((c10 and 0xFF) - (c00 and 0xFF)) * tx
        val bottom = (c01 and 0xFF) + ((c11 and 0xFF) - (c01 and 0xFF)) * tx
        return top + (bottom - top) * ty
    }

    /** Couleur opaque à partir de composantes (arrondies et bornées à 0..255). */
    fun rgb(r: Float, g: Float, b: Float): Int =
        OPAQUE or (r.roundToInt().coerceIn(0, 255) shl 16) or (g.roundToInt().coerceIn(0, 255) shl 8) or b.roundToInt().coerceIn(0, 255)
}

/**
 * Comble les trous d'une image par diffusion pyramidale « push-pull » (calcul pur, testé sur JVM). Les
 * pixels connus sont moyennés de niveau en niveau, chaque niveau deux fois plus petit (« pull »), jusqu'à
 * un seul pixel ; puis, du plus grossier au plus fin, chaque niveau complète ses trous avec le niveau
 * au-dessus, interpolé (« push »). Les couleurs voisines se propagent ainsi en douceur jusqu'au centre des
 * trous, sans bord net.
 */
internal object PushPull {
    /** Niveau de la pyramide : couleurs moyennes et poids (part de pixels connus, plafonnée à 1). */
    private class Level(val width: Int, val height: Int) {
        val r = FloatArray(width * height)
        val g = FloatArray(width * height)
        val b = FloatArray(width * height)
        val w = FloatArray(width * height)
    }

    /**
     * [pixels] : couleurs ARGB ; [known] : poids de chaque pixel (1 connu, 0 à combler, entre les deux :
     * mélange). Renvoie une nouvelle image opaque où seuls les pixels incomplets ont changé. Sans aucun
     * pixel connu, l'image devient grise.
     */
    fun fill(pixels: IntArray, width: Int, height: Int, known: FloatArray): IntArray {
        require(width > 0 && height > 0 && pixels.size == width * height && known.size == pixels.size) { "Tailles incohérentes" }
        val levels = ArrayList<Level>()
        var level = pullFromImage(pixels, width, height, known)
        levels.add(level)
        while (level.width > 1 || level.height > 1) {
            level = pull(level)
            levels.add(level)
        }
        // Sommet de la pyramide : un seul pixel, gris s'il n'y avait rien de connu.
        if (level.w[0] <= 0f) {
            level.r[0] = GRAY
            level.g[0] = GRAY
            level.b[0] = GRAY
        }
        level.w[0] = 1f
        for (i in levels.size - 2 downTo 0) push(levels[i], levels[i + 1])
        return pushToImage(pixels, width, height, known, levels[0])
    }

    private fun pullFromImage(pixels: IntArray, width: Int, height: Int, known: FloatArray): Level {
        val out = Level((width + 1) / 2, (height + 1) / 2)
        for (y in 0 until out.height) {
            for (x in 0 until out.width) {
                var sw = 0f
                var sr = 0f
                var sg = 0f
                var sb = 0f
                for (dy in 0..1) {
                    val yy = 2 * y + dy
                    if (yy >= height) continue
                    for (dx in 0..1) {
                        val xx = 2 * x + dx
                        if (xx >= width) continue
                        val i = yy * width + xx
                        val weight = known[i].coerceIn(0f, 1f)
                        if (weight <= 0f) continue
                        val c = pixels[i]
                        sw += weight
                        sr += weight * ((c shr 16) and 0xFF)
                        sg += weight * ((c shr 8) and 0xFF)
                        sb += weight * (c and 0xFF)
                    }
                }
                store(out, y * out.width + x, sw, sr, sg, sb)
            }
        }
        return out
    }

    private fun pull(fine: Level): Level {
        val out = Level((fine.width + 1) / 2, (fine.height + 1) / 2)
        for (y in 0 until out.height) {
            for (x in 0 until out.width) {
                var sw = 0f
                var sr = 0f
                var sg = 0f
                var sb = 0f
                for (dy in 0..1) {
                    val yy = 2 * y + dy
                    if (yy >= fine.height) continue
                    for (dx in 0..1) {
                        val xx = 2 * x + dx
                        if (xx >= fine.width) continue
                        val i = yy * fine.width + xx
                        val weight = fine.w[i]
                        if (weight <= 0f) continue
                        sw += weight
                        sr += weight * fine.r[i]
                        sg += weight * fine.g[i]
                        sb += weight * fine.b[i]
                    }
                }
                store(out, y * out.width + x, sw, sr, sg, sb)
            }
        }
        return out
    }

    private fun store(level: Level, index: Int, sw: Float, sr: Float, sg: Float, sb: Float) {
        if (sw <= 0f) return
        level.r[index] = sr / sw
        level.g[index] = sg / sw
        level.b[index] = sb / sw
        level.w[index] = min(1f, sw)
    }

    /** Coordonnées dans le niveau grossier (centres des pixels) : pixel voisin et part du suivant. */
    private class Axis(fineSize: Int, coarseSize: Int) {
        val first = IntArray(fineSize)
        val second = IntArray(fineSize)
        val fraction = FloatArray(fineSize)

        init {
            for (i in 0 until fineSize) {
                val c = (i * 0.5f - 0.25f).coerceIn(0f, (coarseSize - 1).toFloat())
                first[i] = c.toInt()
                second[i] = min(first[i] + 1, coarseSize - 1)
                fraction[i] = c - first[i]
            }
        }
    }

    /** Complète les pixels incomplets de [fine] avec [coarse] (déjà complet), interpolé. */
    private fun push(fine: Level, coarse: Level) {
        val xs = Axis(fine.width, coarse.width)
        val ys = Axis(fine.height, coarse.height)
        for (y in 0 until fine.height) {
            for (x in 0 until fine.width) {
                val i = y * fine.width + x
                val weight = fine.w[i]
                if (weight >= 1f) continue
                val keep = weight
                val take = 1f - weight
                fine.r[i] = keep * fine.r[i] + take * interpolate(coarse.r, coarse.width, xs, ys, x, y)
                fine.g[i] = keep * fine.g[i] + take * interpolate(coarse.g, coarse.width, xs, ys, x, y)
                fine.b[i] = keep * fine.b[i] + take * interpolate(coarse.b, coarse.width, xs, ys, x, y)
                fine.w[i] = 1f
            }
        }
    }

    private fun pushToImage(pixels: IntArray, width: Int, height: Int, known: FloatArray, coarse: Level): IntArray {
        val out = IntArray(pixels.size)
        val xs = Axis(width, coarse.width)
        val ys = Axis(height, coarse.height)
        for (y in 0 until height) {
            for (x in 0 until width) {
                val i = y * width + x
                val weight = known[i].coerceIn(0f, 1f)
                val c = pixels[i]
                if (weight >= 1f) {
                    out[i] = c or ReliefMask.OPAQUE
                    continue
                }
                val take = 1f - weight
                out[i] = ReliefMask.rgb(
                    weight * ((c shr 16) and 0xFF) + take * interpolate(coarse.r, coarse.width, xs, ys, x, y),
                    weight * ((c shr 8) and 0xFF) + take * interpolate(coarse.g, coarse.width, xs, ys, x, y),
                    weight * (c and 0xFF) + take * interpolate(coarse.b, coarse.width, xs, ys, x, y),
                )
            }
        }
        return out
    }

    private fun interpolate(values: FloatArray, width: Int, xs: Axis, ys: Axis, x: Int, y: Int): Float {
        val row0 = ys.first[y] * width
        val row1 = ys.second[y] * width
        val x0 = xs.first[x]
        val x1 = xs.second[x]
        val tx = xs.fraction[x]
        val top = values[row0 + x0] + (values[row0 + x1] - values[row0 + x0]) * tx
        val bottom = values[row1 + x0] + (values[row1 + x1] - values[row1 + x0]) * tx
        return top + (bottom - top) * ys.fraction[y]
    }

    private const val GRAY = 128f
}
