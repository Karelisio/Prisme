package io.karelisio.prisme.music

import android.content.Context
import android.graphics.Bitmap
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/** Fichiers de la pochette : cache/music, jetable, seule la dernière image composée est gardée. */
internal object ArtworkFiles {
    private const val DIR = "music"
    private const val PREFIX = "pochette-"
    private const val JPEG_QUALITY = 95

    fun dir(context: Context): File = File(context.cacheDir, DIR).apply { mkdirs() }

    /** Enregistre l'image composée ; le nom change à chaque fois, [prune] retire les précédentes. */
    fun write(context: Context, bitmap: Bitmap): File {
        val file = File(dir(context), "$PREFIX${System.currentTimeMillis()}.jpg")
        val saved = FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
        if (!saved) {
            file.delete()
            throw IOException("Impossible d'enregistrer la pochette")
        }
        return file
    }

    /** Supprime les images composées autres que [keep] (téléchargements en cours exceptés). */
    fun prune(context: Context, keep: File? = null) {
        dir(context).listFiles()?.filter { it.name.startsWith(PREFIX) && it != keep }?.forEach { it.delete() }
    }
}
