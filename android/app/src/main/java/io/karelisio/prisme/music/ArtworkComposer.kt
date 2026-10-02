package io.karelisio.prisme.music

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import androidx.core.graphics.applyCanvas
import androidx.core.graphics.createBitmap
import androidx.core.graphics.scale
import io.karelisio.prisme.wallpaper.ScreenInfo
import io.karelisio.prisme.wallpaper.WallpaperException
import kotlin.math.roundToInt

/**
 * Dessine le fond d'écran de la pochette : la pochette agrandie, floutée et assombrie pour couvrir
 * l'écran, avec au premier plan la pochette nette, coins arrondis et légère ombre. Les positions
 * viennent de [ArtworkLayout].
 */
internal object ArtworkComposer {
    private const val SHADOW_ALPHA = 110

    fun compose(art: Bitmap, screen: ScreenInfo.Size): Bitmap {
        val source = art.toSoftware()
        try {
            val layout = ArtworkLayout.compute(screen.width, screen.height, source.width, source.height)
            return createBitmap(screen.width, screen.height).applyCanvas {
                // Opaque d'office : une pochette transparente ne doit pas laisser de trous.
                drawColor(Color.BLACK)
                drawBlurredBackground(source, layout)
                drawForeground(source, layout)
            }
        } finally {
            if (source !== art) source.recycle()
        }
    }

    /** Les bitmaps matériels ne se dessinent pas sur un canevas logiciel. */
    private fun Bitmap.toSoftware(): Bitmap {
        if (Build.VERSION.SDK_INT >= 26 && config == Bitmap.Config.HARDWARE) {
            return copy(Bitmap.Config.ARGB_8888, false) ?: throw WallpaperException("DECODE_FAILED", "Pochette illisible")
        }
        return this
    }

    /** Flou bon marché : réduction forte, agrandissement filtré en deux étapes, puis assombrissement. */
    private fun Canvas.drawBlurredBackground(art: Bitmap, layout: ArtworkLayout.Layout) {
        val box = layout.backgroundSource
        val small = shrink(art, Rect(box.left, box.top, box.right, box.bottom), layout.blurSmall)
        val middle = small.scale(layout.blurMiddle.width, layout.blurMiddle.height, true)
        drawBitmap(middle, null, Rect(0, 0, width, height), Paint(Paint.FILTER_BITMAP_FLAG))
        if (middle !== small) small.recycle()
        middle.recycle()
        drawColor(Color.argb((ArtworkLayout.DIM * 255).roundToInt(), 0, 0, 0))
    }

    private fun Canvas.drawForeground(art: Bitmap, layout: ArtworkLayout.Layout) {
        val box = layout.foreground
        val sharp = shrink(art, Rect(0, 0, art.width, art.height), ArtworkLayout.Size(box.width, box.height))
        val rect = RectF(box.left.toFloat(), box.top.toFloat(), box.right.toFloat(), box.bottom.toFloat())
        val radius = layout.cornerRadius

        // Ombre : le même rectangle arrondi en noir, que la pochette recouvre ensuite.
        val shadow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            setShadowLayer(layout.shadowBlur, 0f, layout.shadowOffset, Color.argb(SHADOW_ALPHA, 0, 0, 0))
        }
        drawRoundRect(rect, radius, radius, shadow)

        // Pochette : tracée avec un shader, qui donne des coins lisses (un découpage au clip serait crénelé).
        val shader = BitmapShader(sharp, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
            setLocalMatrix(Matrix().apply { setTranslate(rect.left, rect.top) })
        }
        drawRoundRect(rect, radius, radius, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply { this.shader = shader })
        sharp.recycle()
    }

    /**
     * Redessine [region] de [source] à la taille [size]. Au-delà d'un facteur 2, on passe par des moitiés
     * successives : chaque étape moyenne les pixels voisins, ce qu'une seule réduction ne fait pas.
     */
    private fun shrink(source: Bitmap, region: Rect, size: ArtworkLayout.Size): Bitmap {
        var current = source
        var from = region
        while (from.width() >= size.width * 2 && from.height() >= size.height * 2) {
            val next = createBitmap(from.width() / 2, from.height() / 2)
            val last = current
            next.applyCanvas { drawBitmap(last, from, Rect(0, 0, next.width, next.height), Paint(Paint.FILTER_BITMAP_FLAG)) }
            if (current !== source) current.recycle()
            current = next
            from = Rect(0, 0, next.width, next.height)
        }
        val out = createBitmap(size.width, size.height)
        val last = current
        val area = from
        out.applyCanvas { drawBitmap(last, area, Rect(0, 0, size.width, size.height), Paint(Paint.FILTER_BITMAP_FLAG)) }
        if (current !== source) current.recycle()
        return out
    }
}
