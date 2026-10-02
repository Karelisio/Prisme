package io.karelisio.prisme.automation

import kotlin.math.PI
import kotlin.math.acos
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.tan

/** Point géographique en degrés (lieu choisi pour la météo, le soleil ou « Selon le lieu »). */
data class GeoPoint(val latitude: Double, val longitude: Double)

/** Lever et coucher du soleil, algorithme simplifié de la NOAA (précision de l'ordre de 2 min). */
object SunTimes {
    /** Minutes depuis minuit, heure locale ; null pendant le jour ou la nuit polaire. */
    data class Times(val sunrise: Int, val sunset: Int)

    /** [dayOfYear] de 1 à 366, [utcOffsetMinutes] : décalage horaire local de ce jour (heure d'été comprise). */
    fun compute(point: GeoPoint, dayOfYear: Int, utcOffsetMinutes: Int): Times? {
        val gamma = 2 * PI / 365 * (dayOfYear - 1)
        val eqTime = 229.18 * (
            0.000075 + 0.001868 * cos(gamma) - 0.032077 * sin(gamma) - 0.014615 * cos(2 * gamma) - 0.040849 * sin(2 * gamma)
            )
        val declination = 0.006918 - 0.399912 * cos(gamma) + 0.070257 * sin(gamma) - 0.006758 * cos(2 * gamma) +
            0.000907 * sin(2 * gamma) - 0.002697 * cos(3 * gamma) + 0.00148 * sin(3 * gamma)
        val latitude = Math.toRadians(point.latitude)
        val cosHourAngle = cos(Math.toRadians(90.833)) / (cos(latitude) * cos(declination)) - tan(latitude) * tan(declination)
        if (cosHourAngle !in -1.0..1.0) return null
        val hourAngle = Math.toDegrees(acos(cosHourAngle))
        fun local(utcMinutes: Double) = (utcMinutes + utcOffsetMinutes).roundToInt().mod(MINUTES_PER_DAY)
        return Times(
            sunrise = local(720 - 4 * (point.longitude + hourAngle) - eqTime),
            sunset = local(720 - 4 * (point.longitude - hourAngle) - eqTime),
        )
    }

    fun compute(point: GeoPoint, moment: Moment): Times? = compute(point, moment.dayOfYear, moment.utcOffsetMinutes)

    /** Nuit : avant le lever ou après le coucher ; sans soleil connu, de 21 h à 7 h. */
    fun isNight(times: Times?, minuteOfDay: Int): Boolean =
        if (times == null) minuteOfDay >= 21 * 60 || minuteOfDay < 7 * 60 else minuteOfDay < times.sunrise || minuteOfDay >= times.sunset

    private const val MINUTES_PER_DAY = 24 * 60
}
