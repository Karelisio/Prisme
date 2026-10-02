package io.karelisio.prisme.wallpaper

import android.app.WallpaperManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.os.Build
import androidx.core.content.edit
import androidx.core.graphics.ColorUtils
import io.karelisio.prisme.automation.AutomationStore
import io.karelisio.prisme.automation.EveningDim
import io.karelisio.prisme.quote.QuoteRenderer
import io.karelisio.prisme.quote.QuoteRenewal
import io.karelisio.prisme.quote.QuoteScreen
import io.karelisio.prisme.quote.QuoteSpec
import io.karelisio.prisme.quote.QuoteStore
import io.karelisio.prisme.system.ErrorLog
import io.karelisio.prisme.widget.WidgetUpdater
import java.io.File
import java.io.IOException
import java.util.Locale

/** Applique une image (déjà locale) via WallpaperManager, recadrée et à la taille exacte de l'écran. */
internal class WallpaperApplier(private val context: Context) {

    /**
     * Toute application d'un fond par Prisme passe ici (app, automatismes, tuile, pochette de la musique) : la
     * phrase du jour est dessinée sur les écrans choisis, puis le voile du soir se pose par-dessus.
     * [withQuote] à faux pour une pochette de musique : la phrase ne se pose pas sur elle.
     */
    fun apply(file: File, target: WallpaperTarget, crop: NormalizedRect?, screen: ScreenInfo.Size, withQuote: Boolean = true) {
        val manager = WallpaperManager.getInstance(context)
        if (!manager.isWallpaperSupported || !manager.isSetWallpaperAllowed) {
            throw WallpaperException("NOT_ALLOWED", "Cet appareil n'autorise pas le changement de fond d'écran")
        }
        val bounds = BitmapLoader.readBounds(file)
        val region = CropMath.resolveCrop(bounds.width, bounds.height, crop, screen.width, screen.height)
        val bitmap = BitmapLoader.decodeRegion(file, region, screen.width, screen.height)
        try {
            // Un seul passage à la fois : une réapplication du matin ne doit pas croiser celle-ci.
            synchronized(CurrentWallpapers.LOCK) {
                // « Assombrir le soir » et « Citation du jour » : on garde l'image d'origine pour les réappliquer plus tard.
                val dimConfig = AutomationStore(context).config().dim
                val quote = if (withQuote) QuoteRenewal.today(context) else null
                val current = CurrentWallpapers(context)
                if (dimConfig.enabled || QuoteStore(context).enabled) current.save(bitmap, target, quoteAllowed = withQuote) else current.clear()
                val level = EveningDim.current(context)
                present(context, manager, bitmap, target, level, quote)
                current.recordApplied(target, level, quote)
            }
            // Aperçu du widget d'accueil (jamais bloquant : ses erreurs vont dans le journal).
            WidgetUpdater(context).onWallpaperApplied(bitmap, target)
        } finally {
            bitmap.recycle()
        }
    }

    companion object {
        fun setBitmap(manager: WallpaperManager, bitmap: Bitmap, target: WallpaperTarget) {
            try {
                manager.setBitmap(bitmap, null, true, target.flags)
            } catch (e: SecurityException) {
                throw WallpaperException("NOT_ALLOWED", "Changement de fond d'écran refusé par le système", e)
            } catch (e: IOException) {
                throw WallpaperException("APPLY_FAILED", "Le système n'a pas pu appliquer le fond d'écran", e)
            }
        }

        /** Applique [bitmap] recouvert d'un voile noir d'opacité [level] (tel quel à 0). */
        fun setDimmed(manager: WallpaperManager, bitmap: Bitmap, level: Float, target: WallpaperTarget) {
            if (level <= 0f) {
                setBitmap(manager, bitmap, target)
                return
            }
            val copy = bitmap.copy(Bitmap.Config.ARGB_8888, true)
            try {
                Canvas(copy).drawColor(ColorUtils.setAlphaComponent(Color.BLACK, (level.coerceIn(0f, 1f) * 255).toInt()))
                setBitmap(manager, copy, target)
            } finally {
                copy.recycle()
            }
        }

        /**
         * Pose [bitmap] (l'image d'origine) sur [target] : la phrase du jour d'abord, sur les écrans qu'elle vise,
         * puis le voile du soir. Elle n'a pas la même place à l'accueil et au verrouillage : quand un fond pour
         * les deux écrans reçoit la phrase, chacun est posé à son tour. Sans phrase, une seule application.
         */
        fun present(context: Context, manager: WallpaperManager, bitmap: Bitmap, target: WallpaperTarget, level: Float, quote: QuoteSpec?) {
            val screens = listOfNotNull(
                (WallpaperTarget.HOME to QuoteScreen.HOME).takeIf { target != WallpaperTarget.LOCK },
                (WallpaperTarget.LOCK to QuoteScreen.LOCK).takeIf { target != WallpaperTarget.HOME },
            )
            if (quote == null || screens.none { quote.appliesTo(it.second) }) {
                setDimmed(manager, bitmap, level, target)
                return
            }
            for ((part, screen) in screens) {
                val composed = if (quote.appliesTo(screen)) compose(context, bitmap, quote, screen) else null
                try {
                    setDimmed(manager, composed ?: bitmap, level, part)
                } finally {
                    composed?.recycle()
                }
            }
        }

        /** Le fond avec la phrase ; null en cas d'échec (journalisé) : mieux vaut un fond sans phrase qu'aucun fond. */
        private fun compose(context: Context, bitmap: Bitmap, quote: QuoteSpec, screen: QuoteScreen): Bitmap? = try {
            QuoteRenderer.render(bitmap, quote, screen)
        } catch (e: Exception) {
            ErrorLog.record(context, "Citation du jour", e)
            null
        } catch (e: OutOfMemoryError) {
            ErrorLog.record(context, "Citation du jour", e)
            null
        }
    }
}

/** Identité d'un rendu : voile du soir (palier) et phrase. Deux rendus identiques ne sont pas réappliqués. */
internal object RenderSignature {
    fun of(level: Float, quote: QuoteSpec?): String = "${levelKey(level)}|${quote?.key().orEmpty()}"

    /** Palier du voile, à une précision qui absorbe les écarts d'arrondi des flottants. */
    fun levelKey(level: Float): String = String.format(Locale.ROOT, "%.3f", level)
}

/**
 * Fonds posés par Prisme (images d'origine à la taille de l'écran) : pour « Assombrir le soir » (quand le
 * palier change, ils sont réappliqués plus ou moins sombres) et pour « Citation du jour » (réappliqués
 * avec la phrase du jour). Sans copie, il n'y a rien à réappliquer : le fond n'a pas été posé par Prisme.
 */
internal class CurrentWallpapers(private val context: Context) {
    private val dir = File(context.filesDir, "current")
    private val prefs = context.getSharedPreferences("prisme_current", Context.MODE_PRIVATE)

    /**
     * Garde [bitmap] comme original des écrans de [target]. [quoteAllowed] à faux : la phrase du jour ne s'y
     * ajoutera pas (pochette de musique) tant qu'un autre fond n'est pas posé.
     */
    fun save(bitmap: Bitmap, target: WallpaperTarget, quoteAllowed: Boolean = true) {
        dir.mkdirs()
        val files = files(target)
        files.firstOrNull()?.let { first ->
            first.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
            files.drop(1).forEach { first.copyTo(it, overwrite = true) }
        }
        prefs.edit {
            if (target != WallpaperTarget.LOCK) putBoolean(KEY_HOME_QUOTE, quoteAllowed)
            if (target != WallpaperTarget.HOME) putBoolean(KEY_LOCK_QUOTE, quoteAllowed)
        }
    }

    fun clear() {
        if (dir.exists()) dir.deleteRecursively()
        prefs.edit { clear() }
    }

    /** Les copies ne servent plus quand ni le voile du soir ni la phrase du jour ne sont actifs. */
    fun dropIfUnused(dimEnabled: Boolean) {
        synchronized(LOCK) {
            if (!dimEnabled && !QuoteStore(context).enabled) clear()
        }
    }

    /** L'original du fond posé par Prisme sur cet écran est gardé. */
    fun hasOriginal(screen: QuoteScreen): Boolean = File(dir, fileName(screen)).isFile

    /** Mémorise le rendu posé sur les écrans de [target] : palier du voile et, s'il les vise, phrase du jour. */
    fun recordApplied(target: WallpaperTarget, level: Float, quote: QuoteSpec?) = prefs.edit {
        if (target != WallpaperTarget.LOCK) putString(KEY_HOME_SIGNATURE, signature(level, quote, QuoteScreen.HOME))
        if (target != WallpaperTarget.HOME) putString(KEY_LOCK_SIGNATURE, signature(level, quote, QuoteScreen.LOCK))
    }

    /** Réapplique les fonds Prisme au palier [level] avec la phrase du jour, pour ceux dont le rendu a changé (rien si un fond animé est actif). */
    fun refreshDim(level: Float) = refresh(level, QuoteRenewal.today(context))

    /**
     * Réapplique les fonds Prisme dont le rendu a changé : palier du voile et phrase [quote]. Un fond animé actif
     * n'est jamais remplacé (voir [isLive]).
     */
    fun refresh(level: Float, quote: QuoteSpec?) {
        synchronized(LOCK) {
            val manager = WallpaperManager.getInstance(context)
            val homeQuote = quoteFor(QuoteScreen.HOME, quote)
            val lockQuote = quoteFor(QuoteScreen.LOCK, quote)
            // La phrase entre en jeu si elle est active, ou si une est encore posée sur l'écran et doit en partir.
            fun live(screen: QuoteScreen) = isLive(manager, screen, withQuote = quote != null || recorded(screen).substringAfter('|').isNotEmpty())
            val home = File(dir, fileName(QuoteScreen.HOME)).takeIf {
                it.isFile && !live(QuoteScreen.HOME) && recorded(QuoteScreen.HOME) != RenderSignature.of(level, homeQuote)
            }
            val lock = File(dir, fileName(QuoteScreen.LOCK)).takeIf {
                it.isFile && !live(QuoteScreen.LOCK) && recorded(QuoteScreen.LOCK) != RenderSignature.of(level, lockQuote)
            }
            // Même image sur les deux écrans et pas de phrase : une seule application.
            val together = home != null && lock != null && homeQuote == null && lockQuote == null && home.readBytes().contentEquals(lock.readBytes())
            val jobs = if (home != null && together) {
                listOf(Triple(home, WallpaperTarget.BOTH, null))
            } else {
                listOfNotNull(home?.let { Triple(it, WallpaperTarget.HOME, homeQuote) }, lock?.let { Triple(it, WallpaperTarget.LOCK, lockQuote) })
            }
            for ((file, target, screenQuote) in jobs) {
                val original = BitmapFactory.decodeFile(file.path) ?: continue
                try {
                    WallpaperApplier.present(context, manager, original, target, level, screenQuote)
                    recordApplied(target, level, screenQuote)
                } finally {
                    original.recycle()
                }
            }
        }
    }

    /**
     * Un fond animé occupe cet écran : on n'y pose rien, il ne doit jamais être remplacé. L'accueil est animé
     * quand [WallpaperManager.getWallpaperInfo] répond. Sans phrase du jour ([withQuote] faux), un fond animé
     * à l'accueil bloque aussi le verrouillage, comme avant. Avec elle, sur Android 14 et plus, le verrouillage
     * garde son image fixe pendant que l'accueil est animé : il n'est bloqué que s'il suit lui-même le fond animé.
     */
    fun isLive(manager: WallpaperManager, screen: QuoteScreen, withQuote: Boolean): Boolean {
        val homeLive = manager.wallpaperInfo != null
        if (screen == QuoteScreen.HOME || !withQuote || Build.VERSION.SDK_INT < 34) return homeLive
        return manager.getWallpaperInfo(WallpaperManager.FLAG_LOCK) != null ||
            (homeLive && manager.getWallpaperId(WallpaperManager.FLAG_LOCK) < 0)
    }

    /** La phrase qui se pose vraiment sur cet écran : celle qu'il vise, si sa copie d'origine l'accepte. */
    private fun quoteFor(screen: QuoteScreen, quote: QuoteSpec?): QuoteSpec? =
        quote?.takeIf { it.appliesTo(screen) && prefs.getBoolean(quoteKey(screen), true) }

    private fun signature(level: Float, quote: QuoteSpec?, screen: QuoteScreen): String =
        RenderSignature.of(level, quote?.takeIf { it.appliesTo(screen) })

    /** Rendu posé en dernier ; pour une copie d'une version précédente, le seul palier connu (sans phrase). */
    private fun recorded(screen: QuoteScreen): String {
        val home = screen == QuoteScreen.HOME
        return prefs.getString(if (home) KEY_HOME_SIGNATURE else KEY_LOCK_SIGNATURE, null)
            ?: RenderSignature.of(prefs.getFloat(if (home) KEY_HOME_LEVEL else KEY_LOCK_LEVEL, 0f), null)
    }

    private fun fileName(screen: QuoteScreen) = if (screen == QuoteScreen.HOME) HOME_FILE else LOCK_FILE

    private fun quoteKey(screen: QuoteScreen) = if (screen == QuoteScreen.HOME) KEY_HOME_QUOTE else KEY_LOCK_QUOTE

    private fun files(target: WallpaperTarget): List<File> = listOfNotNull(
        File(dir, HOME_FILE).takeIf { target != WallpaperTarget.LOCK },
        File(dir, LOCK_FILE).takeIf { target != WallpaperTarget.HOME },
    )

    companion object {
        /** Sérialise les applications de fonds et leurs réapplications (voile du soir, phrase du matin). */
        val LOCK = Any()

        private const val HOME_FILE = "home.jpg"
        private const val LOCK_FILE = "lock.jpg"

        /** Palier du voile, tel que le gardaient les versions précédentes. */
        private const val KEY_HOME_LEVEL = "home"
        private const val KEY_LOCK_LEVEL = "lock"
        private const val KEY_HOME_SIGNATURE = "homeSignature"
        private const val KEY_LOCK_SIGNATURE = "lockSignature"
        private const val KEY_HOME_QUOTE = "homeQuote"
        private const val KEY_LOCK_QUOTE = "lockQuote"
    }
}
