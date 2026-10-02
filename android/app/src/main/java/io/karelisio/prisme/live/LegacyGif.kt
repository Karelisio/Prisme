@file:Suppress("DEPRECATION")

package io.karelisio.prisme.live

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Movie
import android.graphics.Paint
import android.graphics.RectF
import androidx.core.graphics.createBitmap
import java.io.File
import java.io.IOException

/**
 * Android 8 et moins : [Movie] (obsolète depuis Android 9, mais seul décodeur de GIF de ces versions) lit le GIF
 * image par image. Chaque image est d'abord dessinée dans un bitmap à nous (un canevas accéléré ne sait pas
 * dessiner un Movie), puis mise à l'échelle par la scène. Deux bitmaps en alternance : le dessin accéléré peut
 * encore lire le précédent quand le suivant se prépare.
 */
internal class MovieFrames private constructor(private val movie: Movie) : GifFrames {
    override val width: Int = movie.width()
    override val height: Int = movie.height()
    private val duration = movie.duration()
    override val animated: Boolean = duration > 0
    private val buffers = Array(2) { createBitmap(width, height) }
    private val canvases = Array(2) { Canvas(buffers[it]) }
    private val clock = LoopClock(duration)
    private var current = 0

    init {
        render(0)
    }

    private fun render(position: Int) {
        current = (current + 1) % buffers.size
        movie.setTime(position)
        buffers[current].eraseColor(Color.TRANSPARENT)
        movie.draw(canvases[current], 0f, 0f)
    }

    override fun start() = clock.resume()

    override fun stop() = Unit

    override fun advance(frameTimeNanos: Long): Boolean {
        if (!animated) return false
        render(clock.advance(frameTimeNanos))
        return true
    }

    override fun draw(canvas: Canvas, to: CoverFit.Placement, paint: Paint) {
        canvas.drawBitmap(buffers[current], null, RectF(to.left, to.top, to.left + to.width, to.top + to.height), paint)
    }

    // Pas de recycle() : le dessin accéléré peut encore lire un bitmap au moment où la scène est libérée.
    override fun release() = Unit

    companion object {
        /** Décode le GIF ; [IOException] s'il est illisible. */
        fun decode(file: File): MovieFrames {
            val movie = Movie.decodeFile(file.absolutePath)
            if (movie == null || movie.width() <= 0 || movie.height() <= 0) throw IOException("GIF illisible")
            return MovieFrames(movie)
        }
    }
}
