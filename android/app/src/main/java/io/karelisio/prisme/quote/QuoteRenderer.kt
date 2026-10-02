package io.karelisio.prisme.quote

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import android.text.TextPaint
import androidx.core.graphics.ColorUtils
import androidx.core.graphics.get
import io.karelisio.prisme.wallpaper.WallpaperException
import kotlin.math.roundToInt

/**
 * Dessine la phrase du jour sur un fond d'écran : texte (et auteur) centré, couleur claire ou sombre d'après
 * la luminosité du fond à l'endroit où il se pose, léger voile et ombre pour rester lisible. Les positions
 * viennent de [QuoteLayout], les couleurs de [QuoteColors].
 */
internal object QuoteRenderer {
    /** L'auteur est un peu plus discret que le texte. */
    private const val AUTHOR_ALPHA = 0.85

    /**
     * Copie de [source] avec la phrase dessinée pour l'écran [screen] ; [source] reste intacte (elle sert
     * aussi de copie d'origine, et le voile du soir se pose ensuite sur la copie).
     */
    fun render(source: Bitmap, spec: QuoteSpec, screen: QuoteScreen): Bitmap {
        val out = source.copy(Bitmap.Config.ARGB_8888, true)
            ?: throw WallpaperException("DECODE_FAILED", "Impossible de préparer le fond pour la phrase du jour")
        try {
            val style = spec.style
            val textPaint = paint(typeface(style.font, QuoteLayout.Role.TEXT))
            val authorPaint = paint(typeface(style.font, QuoteLayout.Role.AUTHOR))
            val measure = QuoteLayout.Measure { text, size, role ->
                val paint = if (role == QuoteLayout.Role.TEXT) textPaint else authorPaint
                paint.textSize = size.toFloat()
                paint.measureText(text).toDouble()
            }
            val plan = QuoteLayout.plan(spec.quote.text, spec.quote.author, style, screen, out.width, out.height, measure)
            val luma = localLuma(source, QuoteLayout.sampleBox(plan, source.width, source.height))
            val tone = QuoteColors.toneFor(style.color, luma)
            val canvas = Canvas(out)
            drawVeil(canvas, plan, tone, luma)
            drawText(canvas, plan, tone, textPaint, authorPaint)
            return out
        } catch (e: Throwable) {
            out.recycle()
            throw e
        }
    }

    private fun paint(face: Typeface) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = face
        textAlign = Paint.Align.CENTER
    }

    /** Polices système : serif italique, ou sans-serif léger ; l'auteur en romain, ou en sans-serif moyen. */
    private fun typeface(font: QuoteFont, role: QuoteLayout.Role): Typeface = when (font) {
        QuoteFont.SERIF -> Typeface.create(Typeface.SERIF, if (role == QuoteLayout.Role.TEXT) Typeface.ITALIC else Typeface.NORMAL)
        QuoteFont.SANS -> Typeface.create(if (role == QuoteLayout.Role.TEXT) "sans-serif-light" else "sans-serif-medium", Typeface.NORMAL)
    }

    /** Luminosité moyenne de la zone du texte (mesurée sur le fond d'origine, avant tout dessin). */
    private fun localLuma(source: Bitmap, box: QuoteLayout.Box): Double {
        val pixels = QuoteLayout.samplePoints(box).map { source[it.x, it.y] }.toIntArray()
        return QuoteColors.averageLuma(pixels)
    }

    private fun drawVeil(canvas: Canvas, plan: QuoteLayout.Plan, tone: QuoteColors.Tone, luma: Double) {
        val band = QuoteColors.veilBand(plan, canvas.height)
        val base = if (tone == QuoteColors.Tone.LIGHT) Color.BLACK else Color.WHITE
        val clear = ColorUtils.setAlphaComponent(base, 0)
        val strong = ColorUtils.setAlphaComponent(base, (QuoteColors.veilAlpha(tone, luma) * 255).roundToInt())
        val paint = Paint().apply {
            shader = LinearGradient(
                0f,
                band.top.toFloat(),
                0f,
                band.bottom.toFloat(),
                intArrayOf(clear, strong, strong, clear),
                floatArrayOf(0f, 0.3f, 0.7f, 1f),
                Shader.TileMode.CLAMP,
            )
        }
        canvas.drawRect(0f, band.top.toFloat(), canvas.width.toFloat(), band.bottom.toFloat(), paint)
    }

    private fun drawText(canvas: Canvas, plan: QuoteLayout.Plan, tone: QuoteColors.Tone, text: TextPaint, author: TextPaint) {
        val light = tone == QuoteColors.Tone.LIGHT
        val ink = if (light) Color.WHITE else Color.BLACK
        val shadow = QuoteColors.shadowOf(tone, plan.fontSize)
        val shadowColor = ColorUtils.setAlphaComponent(if (light) Color.BLACK else Color.WHITE, (shadow.alpha * 255).roundToInt())
        val x = plan.centerX.toFloat()

        text.textSize = plan.fontSize.toFloat()
        text.color = ink
        text.setShadowLayer(shadow.blur.toFloat(), 0f, shadow.dy.toFloat(), shadowColor)
        plan.lines.forEachIndexed { i, line -> canvas.drawText(line, x, plan.baselines[i].toFloat(), text) }

        val authorLine = plan.author ?: return
        author.textSize = plan.authorSize.toFloat()
        author.color = ColorUtils.setAlphaComponent(ink, (AUTHOR_ALPHA * 255).roundToInt())
        author.setShadowLayer(shadow.blur.toFloat(), 0f, shadow.dy.toFloat(), shadowColor)
        canvas.drawText(authorLine, x, plan.authorBaseline.toFloat(), author)
    }
}
