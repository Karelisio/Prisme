package io.karelisio.prisme.widget

import io.karelisio.prisme.wallpaper.WallpaperTarget
import java.io.File
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Miniature du fond posé sur l'accueil, affichée par le widget : calculs purs, testés sur JVM
 * (la fabrication et la lecture du fichier sont dans [WidgetUpdater]).
 *
 * L'image part vers le lanceur dans un RemoteViews, donc par un échange binder (limite d'environ 1 Mo) :
 * elle reste petite et se relit en RGB_565, à 2 octets par pixel.
 */
internal object WidgetThumbnail {
    /** Largeur visée, en pixels ; la hauteur suit les proportions de l'écran. */
    const val WIDTH = 360

    /** Surface maximale : 400 000 pixels font 800 Ko en RGB_565, sous la limite d'environ 1 Mo. */
    const val MAX_PIXELS = 400_000

    const val JPEG_QUALITY = 85

    private const val DIR = "widget"
    private const val FILE = "current.jpg"

    data class Size(val width: Int, val height: Int)

    /** Seul un fond posé sur l'accueil (seul ou avec le verrouillage) change l'aperçu du widget. */
    fun appliesTo(target: WallpaperTarget): Boolean = target != WallpaperTarget.LOCK

    /** Taille de la miniature d'un fond de [sourceWidth]×[sourceHeight] : proportions gardées, jamais agrandie. */
    fun sizeFor(sourceWidth: Int, sourceHeight: Int): Size {
        require(sourceWidth > 0 && sourceHeight > 0) { "Image vide" }
        val width = min(WIDTH, sourceWidth).toDouble()
        val height = width * sourceHeight / sourceWidth
        val pixels = width * height
        if (pixels > MAX_PIXELS) {
            // Écran très haut : les deux côtés rétrécissent, arrondis vers le bas pour rester sous la surface permise.
            val factor = sqrt(MAX_PIXELS / pixels)
            return Size(max(1, (width * factor).toInt()), max(1, (height * factor).toInt()))
        }
        return Size(max(1, width.roundToInt()), max(1, height.roundToInt()))
    }

    /** Facteur de sous-échantillonnage (puissance de 2) qui ramène un fichier de [width]×[height] sous [MAX_PIXELS]. */
    fun sampleSizeFor(width: Int, height: Int): Int {
        if (width <= 0 || height <= 0) return 1
        var sample = 1
        while ((width / sample).toLong() * (height / sample) > MAX_PIXELS) sample *= 2
        return sample
    }

    /** Emplacement de la miniature : files/widget/current.jpg. */
    fun file(filesDir: File): File = File(File(filesDir, DIR), FILE)
}
