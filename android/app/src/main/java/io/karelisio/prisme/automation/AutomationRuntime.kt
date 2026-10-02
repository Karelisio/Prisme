package io.karelisio.prisme.automation

import android.content.Context
import android.os.BatteryManager
import io.karelisio.prisme.wallpaper.CacheKeys
import io.karelisio.prisme.wallpaper.Downloader
import io.karelisio.prisme.wallpaper.LocalUrls
import io.karelisio.prisme.wallpaper.WallpaperException
import io.karelisio.prisme.wallpaper.WallpaperRef
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

/** Images des automatismes : copies locales dédiées, indépendantes du cache et des favoris. */
internal class AutomationFiles(context: Context) {
    private val dir = File(context.filesDir, "automation")

    fun resolve(ref: WallpaperRef): File {
        val uri = ref.uri
        val file = if (uri.startsWith("https://") || uri.startsWith("http://")) {
            LocalUrls.toFilePath(uri)?.let(::File) ?: File(dir, CacheKeys.of(uri)).also {
                if (!it.isFile) {
                    dir.mkdirs()
                    Downloader.download(uri, it, null)
                }
            }
        } else {
            File(uri.removePrefix("file://"))
        }
        if (!file.isFile) throw WallpaperException("NOT_FOUND", "Image d'automatisme introuvable")
        return file
    }

    /** Télécharge à l'avance les images distantes (sans échouer si le réseau manque). */
    fun prefetch(config: AutomationConfig) {
        for (ref in config.refs()) runCatching { resolve(ref) }
    }

    /** Supprime les copies qui ne servent plus à aucun automatisme ([current] : fond en ligne actuel). */
    fun cleanup(config: AutomationConfig, current: WallpaperRef? = null) {
        val keep = (config.refs() + listOfNotNull(current)).map { CacheKeys.of(it.uri) }.toSet()
        dir.listFiles()?.forEach { if (it.name !in keep) it.delete() }
    }
}

internal object BatteryReader {
    data class Status(val level: Int, val charging: Boolean)

    fun read(context: Context): Status? {
        val manager = context.getSystemService(BatteryManager::class.java) ?: return null
        val level = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        if (level !in 0..100) return null
        return Status(level, manager.isCharging)
    }
}

/** Météo actuelle via Open-Meteo (gratuit, sans clé). */
internal object WeatherClient {
    fun current(latitude: Double, longitude: Double): WeatherCondition {
        val url = String.format(
            Locale.US,
            "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=weather_code,is_day",
            latitude,
            longitude,
        )
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        try {
            if (connection.responseCode != 200) throw IOException("HTTP ${connection.responseCode}")
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            return parse(body)
        } finally {
            connection.disconnect()
        }
    }

    fun parse(body: String): WeatherCondition {
        val current = JSONObject(body).getJSONObject("current")
        return RulesEngine.weatherFromCode(current.getInt("weather_code"), current.optInt("is_day", 1) == 1)
    }
}
