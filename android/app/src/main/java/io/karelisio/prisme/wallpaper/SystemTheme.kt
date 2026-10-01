package io.karelisio.prisme.wallpaper

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import com.getcapacitor.JSObject
import java.util.Locale

/**
 * Thème système : mode sombre, palettes Material You (Android 12+)
 * et rôles de couleur exacts (Android 14+).
 */
internal object SystemTheme {
    private val PALETTES = arrayOf("accent1", "accent2", "accent3", "neutral1", "neutral2")
    private val TONES = intArrayOf(0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000)
    private val ROLES = arrayOf(
        "primary", "on_primary", "primary_container", "on_primary_container",
        "secondary", "on_secondary", "secondary_container", "on_secondary_container",
        "tertiary", "on_tertiary", "tertiary_container", "on_tertiary_container",
        "error", "on_error", "error_container", "on_error_container",
        "background", "on_background", "surface", "on_surface",
        "surface_variant", "on_surface_variant", "outline", "outline_variant",
        "surface_dim", "surface_bright", "surface_container_lowest", "surface_container_low",
        "surface_container", "surface_container_high", "surface_container_highest",
    )

    fun read(context: Context): JSObject {
        val out = JSObject()
        val night = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        out.put("isDark", night == Configuration.UI_MODE_NIGHT_YES)
        out.put("sdkInt", Build.VERSION.SDK_INT)
        if (Build.VERSION.SDK_INT >= 31) {
            val palettes = JSObject()
            for (palette in PALETTES) {
                val tones = JSObject()
                for (tone in TONES) colorOf(context, "system_${palette}_$tone")?.let { tones.put(tone.toString(), it) }
                palettes.put(palette, tones)
            }
            out.put("palettes", palettes)
        }
        if (Build.VERSION.SDK_INT >= 34) {
            val light = JSObject()
            val dark = JSObject()
            for (role in ROLES) {
                val key = ColorFormat.camelCase(role)
                colorOf(context, "system_${role}_light")?.let { light.put(key, it) }
                colorOf(context, "system_${role}_dark")?.let { dark.put(key, it) }
            }
            out.put("roles", JSObject().put("light", light).put("dark", dark))
        }
        return out
    }

    @SuppressLint("DiscouragedApi")
    private fun colorOf(context: Context, name: String): String? {
        val id = context.resources.getIdentifier(name, "color", "android")
        return if (id == 0) null else ColorFormat.hex(context.getColor(id))
    }
}

internal object ColorFormat {
    fun hex(argb: Int): String = String.format(Locale.US, "#%06X", argb and 0xFFFFFF)

    fun camelCase(snake: String): String = snake.split('_')
        .mapIndexed { i, part -> if (i == 0) part else part.replaceFirstChar { it.uppercaseChar() } }
        .joinToString("")
}
