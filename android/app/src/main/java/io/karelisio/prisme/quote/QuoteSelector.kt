package io.karelisio.prisme.quote

import java.util.Calendar

/**
 * Choix de la phrase du jour : les mêmes calculs, en entiers, que l'app (src/features/quote/selection.ts),
 * pour que le fond d'écran et l'aperçu affichent toujours la même phrase. Les mêmes valeurs d'essai sont
 * vérifiées des deux côtés ; toute modification doit être reportée dans l'autre langage.
 */
internal object QuoteSelector {
    /** Le nombre d'or en entier 32 bits : sert à tirer la graine du nombre de phrases. */
    private val GOLDEN = 0x9E3779B1L.toInt()

    /** Numéro du jour : jours écoulés depuis le 1er janvier 1970, calendrier grégorien. [month] va de 1 à 12. */
    fun dayNumber(year: Int, month: Int, day: Int): Int {
        val y = if (month <= 2) year - 1 else year
        val era = Math.floorDiv(y, 400)
        val yearOfEra = y - era * 400
        val dayOfYear = (153 * ((month + 9) % 12) + 2) / 5 + day - 1
        val dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear
        return era * 146097 + dayOfEra - 719468
    }

    /** Numéro du jour de [calendar], d'après son calendrier local. */
    fun dayNumber(calendar: Calendar): Int =
        dayNumber(calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH) + 1, calendar.get(Calendar.DAY_OF_MONTH))

    /** Mulberry32 : générateur 32 bits ; [next] renvoie un entier non signé (dans un Long). */
    private class Mulberry32(seed: Int) {
        private var state = seed

        fun next(): Long {
            state += 0x6D2B79F5
            var t = (state xor (state ushr 15)) * (1 or state)
            t = (t + (t xor (t ushr 7)) * (61 or t)) xor t
            return (t xor (t ushr 14)).toLong() and 0xFFFFFFFFL
        }
    }

    /**
     * Ordre de passage des [count] phrases : un mélange (Fisher-Yates) qui ne dépend que de leur nombre. Une
     * phrase ne revient donc qu'après avoir parcouru toute la liste, et jamais deux jours de suite.
     */
    fun passOrder(count: Int): IntArray {
        val order = IntArray(maxOf(0, count)) { it }
        val random = Mulberry32(count * GOLDEN)
        for (i in order.size - 1 downTo 1) {
            val j = ((random.next() * (i + 1)) ushr 32).toInt()
            val kept = order[i]
            order[i] = order[j]
            order[j] = kept
        }
        return order
    }

    /**
     * Rang de la phrase du jour dans une liste de [count] phrases. [shift] avance la suite (« Une autre ») : chaque
     * cran passe à la phrase suivante, aujourd'hui comme les jours à venir, sans en répéter. -1 si la liste est vide.
     */
    fun pickIndex(day: Int, shift: Int, count: Int): Int {
        if (count <= 0) return -1
        val position = day.toLong() + maxOf(0, shift)
        return passOrder(count)[Math.floorMod(position, count.toLong()).toInt()]
    }

    /** La phrase du jour avec sa présentation ; null si l'option est coupée ou la liste vide. */
    fun today(config: QuoteConfig, calendar: Calendar): QuoteSpec? {
        if (!config.enabled || config.quotes.isEmpty()) return null
        val index = pickIndex(dayNumber(calendar), config.shift, config.quotes.size)
        return config.quotes.getOrNull(index)?.let { QuoteSpec(it, config.style, config.target) }
    }
}
