package io.karelisio.prisme.quick

import android.content.Context
import android.widget.Toast
import io.karelisio.prisme.R
import io.karelisio.prisme.automation.AutomationRunner
import io.karelisio.prisme.automation.AutomationStore
import io.karelisio.prisme.wallpaper.AppliedWallpapers
import io.karelisio.prisme.wallpaper.ImageStore
import io.karelisio.prisme.wallpaper.ScreenInfo
import io.karelisio.prisme.wallpaper.WallpaperApplier
import io.karelisio.prisme.wallpaper.WallpaperException
import org.json.JSONObject
import kotlin.random.Random

/**
 * Changement de fond demandé par la tuile ou un raccourci : rotation suivante si elle est active,
 * sinon un fond pris au hasard dans la réserve envoyée par l'app (favoris, ou fonds récents).
 */
internal class QuickChanger(private val context: Context) {

    sealed interface Outcome {
        data object Applied : Outcome
        data object Empty : Outcome
        data class Failed(val message: String) : Outcome
    }

    fun run(mode: String): Outcome {
        if (mode == QuickActions.MODE_NEXT && advanceRotation()) return Outcome.Applied
        return applyFromPool()
    }

    private fun advanceRotation(): Boolean {
        val store = AutomationStore(context)
        if (!QuickPool.rotationDrivesNext(store.config(), AutomationStore.now())) return false
        store.saveState(store.state().copy(lastRotationAt = 0))
        if (AutomationRunner.run(context, prefetch = false, force = false) == AutomationRunner.Outcome.RETRY) {
            throw WallpaperException("DOWNLOAD_FAILED", "image de la rotation indisponible (connexion ?)")
        }
        return true
    }

    private fun applyFromPool(): Outcome {
        val pool = QuickPool(context)
        val data = pool.load()
        val ref = QuickPool.pick(data.items, pool.lastId, Random.Default) ?: return Outcome.Empty
        val file = ImageStore(context).resolve(ref.uri)
        WallpaperApplier(context).apply(file, data.target, ref.crop, ScreenInfo.read(context, null))
        pool.lastId = ref.id
        AppliedWallpapers(context).recordManual(data.target, ref)
        val entry = JSONObject().put("id", ref.id).put("target", data.target.key).put("at", System.currentTimeMillis()).put("reason", "quick")
        AutomationStore(context).appendLog(listOf(entry))
        return Outcome.Applied
    }

    companion object {
        fun message(context: Context, outcome: Outcome): String = when (outcome) {
            Outcome.Applied -> context.getString(R.string.quick_applied)
            Outcome.Empty -> context.getString(R.string.quick_no_favorites)
            is Outcome.Failed -> context.getString(R.string.quick_failed, outcome.message)
        }

        /** Sous-titre court de la tuile après le changement. */
        fun tileLabel(context: Context, outcome: Outcome): String = context.getString(
            when (outcome) {
                Outcome.Applied -> R.string.tile_done
                Outcome.Empty -> R.string.tile_empty
                is Outcome.Failed -> R.string.tile_failed
            },
        )

        fun toast(context: Context, outcome: Outcome) {
            Toast.makeText(context, message(context, outcome), Toast.LENGTH_LONG).show()
        }
    }
}
