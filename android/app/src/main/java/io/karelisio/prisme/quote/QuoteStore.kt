package io.karelisio.prisme.quote

import android.content.Context
import androidx.core.content.edit

/**
 * Réglages de la phrase du jour envoyés par l'app, dans des SharedPreferences dédiées : le rendu
 * (voir WallpaperApplier), le renouvellement du matin et le plugin les lisent, y compris app fermée.
 */
internal class QuoteStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Lecture rapide : l'option est-elle active ? (sans relire toute la liste des phrases). */
    val enabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, false)

    fun config(): QuoteConfig = QuoteConfig.parse(prefs.getString(KEY_CONFIG, null))

    fun save(raw: String, enabled: Boolean) = prefs.edit {
        putString(KEY_CONFIG, raw)
        putBoolean(KEY_ENABLED, enabled)
    }

    private companion object {
        const val PREFS = "prisme_quote"
        const val KEY_CONFIG = "config"
        const val KEY_ENABLED = "enabled"
    }
}
