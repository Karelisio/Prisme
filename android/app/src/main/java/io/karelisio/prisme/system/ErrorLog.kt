package io.karelisio.prisme.system

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * Journal des erreurs natives (plantages, échecs en tâche de fond) : un fichier JSON par ligne,
 * borné aux [MAX_ENTRIES] dernières entrées, affiché et exportable depuis l'écran Diagnostic.
 */
internal object ErrorLog {
    private const val FILE_NAME = "errors.jsonl"
    const val MAX_ENTRIES = 50
    const val MAX_STACK_CHARS = 4000
    private val lock = Any()

    /** Enregistre les plantages avant de laisser le gestionnaire du système fermer l'app. */
    fun install(context: Context) {
        val appContext = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching { record(appContext, "Plantage (${thread.name})", error) }
            previous?.uncaughtException(thread, error)
        }
    }

    fun record(context: Context, where: String, error: Throwable) {
        val entry = entry(System.currentTimeMillis(), where, error)
        synchronized(lock) {
            val file = file(context)
            val lines = if (file.isFile) file.readLines() else emptyList()
            file.writeText(trim(lines + entry.toString(), MAX_ENTRIES).joinToString("\n", postfix = "\n"))
        }
    }

    fun entries(context: Context): List<JSONObject> = synchronized(lock) {
        val file = file(context)
        if (!file.isFile) return emptyList()
        file.readLines().mapNotNull { line -> runCatching { JSONObject(line) }.getOrNull() }
    }

    fun clear(context: Context) = synchronized(lock) { file(context).delete() }

    fun entry(at: Long, where: String, error: Throwable): JSONObject = JSONObject()
        .put("at", at)
        .put("source", "native")
        .put("where", where)
        .put("message", "${error.javaClass.simpleName}: ${error.message ?: "sans message"}")
        .put("stack", error.stackTraceToString().take(MAX_STACK_CHARS))

    /** Garde les [max] dernières lignes non vides. */
    fun trim(lines: List<String>, max: Int): List<String> = lines.filter { it.isNotBlank() }.takeLast(max)

    private fun file(context: Context) = File(context.filesDir, FILE_NAME)
}
