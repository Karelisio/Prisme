package io.karelisio.prisme.quick

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import io.karelisio.prisme.R
import io.karelisio.prisme.automation.AutomationScheduler
import io.karelisio.prisme.automation.AutomationStore
import io.karelisio.prisme.system.ErrorLog
import io.karelisio.prisme.wallpaper.AppliedWallpapers
import io.karelisio.prisme.wallpaper.ImageStore
import io.karelisio.prisme.wallpaper.ScreenInfo
import io.karelisio.prisme.wallpaper.WallpaperApplier
import io.karelisio.prisme.wallpaper.WallpaperException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import kotlin.random.Random

/** Change le fond depuis la tuile ou un raccourci, app fermée ; l'app l'ajoute ensuite à l'historique. */
class QuickNextWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val mode = inputData.getString(KEY_MODE) ?: QuickActions.MODE_NEXT
        try {
            if (mode == QuickActions.MODE_NEXT && advanceRotation()) return@withContext Result.success()
            applyFavorite()
        } catch (e: WallpaperException) {
            toast(applicationContext.getString(R.string.quick_failed, e.message))
        } catch (e: Exception) {
            ErrorLog.record(applicationContext, "Fond suivant", e)
            toast(applicationContext.getString(R.string.quick_failed, e.message ?: e.javaClass.simpleName))
        }
        Result.success()
    }

    private fun advanceRotation(): Boolean {
        val store = AutomationStore(applicationContext)
        if (!QuickPool.rotationDrivesNext(store.config(), AutomationStore.now())) return false
        store.saveState(store.state().copy(lastRotationAt = 0))
        AutomationScheduler.runNow(applicationContext)
        return true
    }

    private fun applyFavorite() {
        val pool = QuickPool(applicationContext)
        val data = pool.load()
        val ref = QuickPool.pick(data.items, pool.lastId, Random.Default)
        if (ref == null) {
            toast(applicationContext.getString(R.string.quick_no_favorites))
            return
        }
        val file = ImageStore(applicationContext).resolve(ref.uri)
        WallpaperApplier(applicationContext).apply(file, data.target, ref.crop, ScreenInfo.read(applicationContext, null))
        pool.lastId = ref.id
        AppliedWallpapers(applicationContext).recordManual(data.target, ref)
        val entry = JSONObject().put("id", ref.id).put("target", data.target.key).put("at", System.currentTimeMillis()).put("reason", "quick")
        AutomationStore(applicationContext).appendLog(listOf(entry))
        toast(applicationContext.getString(R.string.quick_applied))
    }

    private fun toast(text: String) {
        Handler(Looper.getMainLooper()).post { Toast.makeText(applicationContext, text, Toast.LENGTH_SHORT).show() }
    }

    companion object {
        const val KEY_MODE = "mode"
    }
}
