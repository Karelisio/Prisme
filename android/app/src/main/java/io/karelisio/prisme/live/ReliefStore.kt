package io.karelisio.prisme.live

import android.content.Context
import androidx.core.content.edit
import org.json.JSONException
import org.json.JSONObject
import java.io.File

/**
 * Relief 3D préparé : fichiers (arrière-plan comblé, sujet détouré, vignette) et place du sujet dans
 * l'image, enregistrés d'un bloc sous une clé à part. Les réglages de la scène (`scene_relief`) sont
 * remplacés par l'app à chaque changement : les chemins n'y sont donc pas rangés.
 */
internal object ReliefStore {
    /** Clé des préférences du fond animé : sa modification fait recharger la scène. */
    const val KEY = "relief_prepared"

    /** Fichiers du relief, dans files/live/relief (un seul relief à la fois). */
    fun dir(context: Context): File = File(File(context.filesDir, "live"), "relief")

    data class Prepared(
        /** Photo recadrée à la taille de l'écran plus la marge, sujet effacé (JPEG). */
        val background: String,
        /** Sujet détouré aux bords adoucis, découpé à sa taille (PNG transparent). */
        val subject: String,
        /** Petite vignette du sujet détouré (PNG). */
        val preview: String,
        val imageWidth: Int,
        val imageHeight: Int,
        /** Place du sujet dans l'image. */
        val subjectLeft: Int,
        val subjectTop: Int,
        val subjectWidth: Int,
        val subjectHeight: Int,
        /** Image d'origine (URI donnée par l'app). */
        val source: String,
        /** Part de l'image occupée par le sujet. */
        val coverage: Float,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("background", background)
            .put("subject", subject)
            .put("preview", preview)
            .put("imageWidth", imageWidth)
            .put("imageHeight", imageHeight)
            .put("subjectLeft", subjectLeft)
            .put("subjectTop", subjectTop)
            .put("subjectWidth", subjectWidth)
            .put("subjectHeight", subjectHeight)
            .put("source", source)
            .put("coverage", coverage.toDouble())

        companion object {
            /** Relief enregistré, ou null s'il manque ou est incomplet. */
            fun parse(raw: String?): Prepared? {
                if (raw.isNullOrBlank()) return null
                return try {
                    val json = JSONObject(raw)
                    val prepared = Prepared(
                        background = json.getString("background"),
                        subject = json.getString("subject"),
                        preview = json.optString("preview", ""),
                        imageWidth = json.getInt("imageWidth"),
                        imageHeight = json.getInt("imageHeight"),
                        subjectLeft = json.getInt("subjectLeft"),
                        subjectTop = json.getInt("subjectTop"),
                        subjectWidth = json.getInt("subjectWidth"),
                        subjectHeight = json.getInt("subjectHeight"),
                        source = json.optString("source", ""),
                        coverage = json.optDouble("coverage", 0.0).toFloat(),
                    )
                    prepared.takeIf { it.imageWidth > 0 && it.imageHeight > 0 && it.subjectWidth > 0 && it.subjectHeight > 0 }
                } catch (e: JSONException) {
                    null
                }
            }
        }
    }

    /** Relief prêt, si ses fichiers sont toujours là. */
    fun read(context: Context): Prepared? =
        Prepared.parse(LiveWallpaperStore.prefs(context).getString(KEY, null))
            ?.takeIf { File(it.background).isFile && File(it.subject).isFile }

    /** Enregistré tout de suite sur le disque : les anciens fichiers peuvent ensuite être supprimés. */
    fun save(context: Context, prepared: Prepared) {
        LiveWallpaperStore.prefs(context).edit(commit = true) { putString(KEY, prepared.toJson().toString()) }
    }
}
