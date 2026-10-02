package io.karelisio.prisme.live

import android.content.Context
import android.graphics.Bitmap
import android.os.SystemClock
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.moduleinstall.InstallStatusListener
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.android.gms.common.moduleinstall.ModuleInstallStatusCodes
import com.google.android.gms.common.moduleinstall.ModuleInstallStatusUpdate
import com.google.android.gms.common.moduleinstall.ModuleInstallStatusUpdate.InstallState
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.MlKit
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import io.karelisio.prisme.wallpaper.WallpaperException
import java.io.Closeable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * Détourage du sujet par ML Kit (Google Play services). Le modèle n'est pas dans l'APK : il est téléchargé
 * à la demande, la première fois. Les erreurs (pas de Play services, hors ligne, plus de place) deviennent
 * des messages clairs. Attentes bloquantes : à appeler hors du fil principal.
 */
internal class ReliefSegmenter(context: Context) : Closeable {
    private val context = context.applicationContext
    private val segmenter: SubjectSegmenter

    init {
        checkPlayServices(this.context)
        segmenter = try {
            // ML Kit n'est pas initialisé au démarrage de l'app (fournisseur retiré du manifeste) : seulement ici.
            MlKit.initialize(this.context)
            SubjectSegmentation.getClient(SubjectSegmenterOptions.Builder().enableForegroundConfidenceMask().build())
        } catch (e: RuntimeException) {
            throw unsupported(e)
        }
    }

    override fun close() = segmenter.close()

    /**
     * Vérifie que le module de détourage est installé ; sinon le télécharge en annonçant la progression
     * (0..1, ou null si elle est inconnue). Renvoie vrai s'il vient d'être installé.
     */
    fun ensureModule(onProgress: (Float?) -> Unit): Boolean {
        val client = ModuleInstall.getClient(context)
        if (await(client.areModulesAvailable(segmenter), CHECK_TIMEOUT_MS, ::moduleError).areModulesAvailable()) return false
        onProgress(null)
        val watcher = InstallWatcher(onProgress)
        val request = ModuleInstallRequest.newBuilder().addApi(segmenter).setListener(watcher, DIRECT).build()
        try {
            val response = await(client.installModules(request), CHECK_TIMEOUT_MS, ::moduleError)
            if (!response.areModulesAlreadyInstalled()) watcher.await()
        } finally {
            // Le téléchargement continue sans nous s'il n'est pas fini : un nouvel essai le retrouvera.
            runCatching { client.unregisterListener(watcher) }
        }
        return true
    }

    /**
     * Confiance (0..1) que chaque pixel de [image] appartienne au sujet, ligne après ligne. [justInstalled] :
     * le module vient d'arriver et peut demander un instant avant de répondre (un second essai).
     */
    fun segment(image: Bitmap, justInstalled: Boolean): FloatArray {
        val input = InputImage.fromBitmap(image, 0)
        val result = try {
            await(segmenter.process(input), PROCESS_TIMEOUT_MS, ::segmentError)
        } catch (e: WallpaperException) {
            if (!justInstalled || e.code != CODE_DOWNLOADING) throw e
            SystemClock.sleep(RETRY_DELAY_MS)
            await(segmenter.process(input), PROCESS_TIMEOUT_MS, ::segmentError)
        }
        val mask = result.foregroundConfidenceMask ?: throw noSubject()
        val values = FloatArray(image.width * image.height)
        mask.rewind()
        if (mask.remaining() < values.size) throw failed(null)
        mask.get(values)
        return values
    }

    /** Suit le téléchargement du module : terminé, en échec, ou bloqué (hors ligne, en attente du Wi-Fi…). */
    private class InstallWatcher(private val onProgress: (Float?) -> Unit) : InstallStatusListener {
        private val done = CountDownLatch(1)

        @Volatile
        private var state = InstallState.STATE_UNKNOWN

        @Volatile
        private var errorCode = ModuleInstallStatusCodes.SUCCESS

        @Volatile
        private var lastChange = SystemClock.elapsedRealtime()

        @Volatile
        private var lastBytes = -1L

        override fun onInstallStatusUpdated(update: ModuleInstallStatusUpdate) {
            if (update.installState != state) lastChange = SystemClock.elapsedRealtime()
            state = update.installState
            errorCode = update.errorCode
            val info = update.progressInfo
            if (info != null && info.bytesDownloaded != lastBytes) {
                lastBytes = info.bytesDownloaded
                lastChange = SystemClock.elapsedRealtime()
                val total = info.totalBytesToDownload
                onProgress(if (total > 0) (info.bytesDownloaded.toFloat() / total).coerceIn(0f, 1f) else null)
            }
            when (state) {
                InstallState.STATE_COMPLETED, InstallState.STATE_FAILED, InstallState.STATE_CANCELED -> done.countDown()
            }
        }

        /** Attend la fin ; sans progrès depuis [STALL_MS] ou au-delà de [MAX_WAIT_MS], abandonne (le téléchargement continue). */
        fun await() {
            val deadline = SystemClock.elapsedRealtime() + MAX_WAIT_MS
            while (!done.await(POLL_MS, TimeUnit.MILLISECONDS)) {
                val now = SystemClock.elapsedRealtime()
                if (now > deadline || now - lastChange > STALL_MS) throw downloading(null)
            }
            when {
                state == InstallState.STATE_COMPLETED -> Unit
                errorCode == ModuleInstallStatusCodes.INSUFFICIENT_STORAGE -> throw noSpace(null)
                else -> throw installFailed(null)
            }
        }
    }

    companion object {
        const val CODE_UNSUPPORTED = "UNSUPPORTED"
        const val CODE_DOWNLOADING = "MODULE_DOWNLOADING"
        const val CODE_NO_SUBJECT = "NO_SUBJECT"

        private const val CHECK_TIMEOUT_MS = 20_000L
        private const val PROCESS_TIMEOUT_MS = 30_000L
        private const val RETRY_DELAY_MS = 1_500L
        private const val POLL_MS = 500L

        /** Téléchargement sans aucun progrès pendant ce temps : sans doute hors ligne. */
        private const val STALL_MS = 20_000L
        private const val MAX_WAIT_MS = 120_000L

        /** Rappels du téléchargement sur le fil de Play services : l'attente bloque un fil d'arrière-plan. */
        private val DIRECT = Executor { it.run() }

        fun unsupported(cause: Throwable?) = WallpaperException(CODE_UNSUPPORTED, "Relief 3D indisponible sur cet appareil", cause)

        fun downloading(cause: Throwable?) =
            WallpaperException(CODE_DOWNLOADING, "Téléchargement du module en cours, réessaie dans un instant", cause)

        fun noSubject() =
            WallpaperException(CODE_NO_SUBJECT, "Aucun sujet détecté sur cette photo : choisis-en une avec un sujet net au premier plan")

        private fun installFailed(cause: Throwable?) =
            WallpaperException("MODULE_FAILED", "Téléchargement du module Relief 3D impossible : vérifie la connexion, puis réessaie", cause)

        private fun noSpace(cause: Throwable?) =
            WallpaperException("NO_SPACE", "Pas assez d'espace libre pour le module Relief 3D", cause)

        private fun failed(cause: Throwable?) = WallpaperException("SEGMENTATION_FAILED", "Détourage impossible, réessaie", cause)

        private fun checkPlayServices(context: Context) {
            val status = try {
                GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
            } catch (e: RuntimeException) {
                ConnectionResult.SERVICE_MISSING
            }
            when (status) {
                ConnectionResult.SUCCESS -> Unit
                ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED, ConnectionResult.SERVICE_UPDATING ->
                    throw WallpaperException(CODE_UNSUPPORTED, "Relief 3D : mets à jour les services Google Play, puis réessaie")
                else -> throw unsupported(null)
            }
        }

        /** Attend [task] ; les erreurs, l'expiration et l'interruption passent par [translate]. */
        private fun <T> await(task: Task<T>, timeoutMs: Long, translate: (Throwable) -> WallpaperException): T = try {
            Tasks.await(task, timeoutMs, TimeUnit.MILLISECONDS)
        } catch (e: ExecutionException) {
            throw translate(e.cause ?: e)
        } catch (e: TimeoutException) {
            throw translate(e)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            throw translate(e)
        }

        private fun moduleError(error: Throwable): WallpaperException {
            if (error !is ApiException) return if (error is TimeoutException || error is InterruptedException) downloading(error) else installFailed(error)
            return when (error.statusCode) {
                CommonStatusCodes.NETWORK_ERROR, CommonStatusCodes.TIMEOUT -> downloading(error)
                ModuleInstallStatusCodes.INSUFFICIENT_STORAGE -> noSpace(error)
                CommonStatusCodes.API_NOT_CONNECTED,
                ConnectionResult.SERVICE_MISSING,
                ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED,
                ConnectionResult.SERVICE_DISABLED,
                ConnectionResult.SERVICE_INVALID,
                ModuleInstallStatusCodes.UNKNOWN_MODULE,
                ModuleInstallStatusCodes.NOT_ALLOWED_MODULE,
                ModuleInstallStatusCodes.MODULE_NOT_FOUND,
                -> unsupported(error)
                else -> installFailed(error)
            }
        }

        /** Module pas encore prêt (téléchargé à la première demande), plus de place, ou échec du détourage. */
        private fun segmentError(error: Throwable): WallpaperException = when ((error as? MlKitException)?.errorCode) {
            MlKitException.UNAVAILABLE -> downloading(error)
            MlKitException.NOT_ENOUGH_SPACE -> noSpace(error)
            else -> failed(error)
        }
    }
}
