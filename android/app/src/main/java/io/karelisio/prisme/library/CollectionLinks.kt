package io.karelisio.prisme.library

/**
 * Liens de partage de collection « prisme://collection/<code> » (partage sans compte). On ne
 * vérifie ici que la forme du lien et sa taille : l'interface lit le code et décide s'il est valide.
 */
internal object CollectionLinks {
    const val PREFIX = "prisme://collection/"

    /** Plus long, ce n'est pas un code de partage (l'interface en lit 24 000 caractères au plus). */
    const val MAX_LENGTH = 25_000

    private const val ACTION_VIEW = "android.intent.action.VIEW"

    /**
     * Lien porté par un intent, ou null. Un intent rejoué par le système quand l'app est rouverte
     * depuis les applications récentes ([fromHistory]) ne compte pas : le lien a déjà servi.
     */
    fun accept(action: String?, data: String?, fromHistory: Boolean = false): String? {
        if (fromHistory || action != ACTION_VIEW || data == null) return null
        if (!data.startsWith(PREFIX) || data.length <= PREFIX.length || data.length > MAX_LENGTH) return null
        return data
    }
}
