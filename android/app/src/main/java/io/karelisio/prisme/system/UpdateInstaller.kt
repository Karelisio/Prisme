package io.karelisio.prisme.system

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import androidx.core.net.toUri
import io.karelisio.prisme.wallpaper.Downloader
import io.karelisio.prisme.wallpaper.WallpaperException
import java.io.File
import java.security.MessageDigest

/**
 * Mise à jour depuis les releases GitHub : téléchargement de l'APK, vérifications (même appli,
 * version plus récente, même signature), puis ouverture de l'installateur du système.
 */
internal class UpdateInstaller(private val context: Context) {
    private val dir = File(context.cacheDir, "updates")

    fun download(url: String, onProgress: (Float) -> Unit): File {
        if (!url.startsWith("https://")) throw WallpaperException("INVALID_ARGUMENT", "Adresse de mise à jour invalide")
        dir.deleteRecursively()
        dir.mkdirs()
        val file = File(dir, APK_NAME)
        Downloader.download(url, file, onProgress)
        try {
            verify(file)
        } catch (e: WallpaperException) {
            file.delete()
            throw e
        }
        return file
    }

    /** APK déjà téléchargé et vérifié (le plugin a pu être recréé entre-temps). */
    fun cached(): File? = File(dir, APK_NAME).takeIf { it.isFile && it.length() > 0 }

    fun canInstall(): Boolean = Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()

    fun install(activity: Activity, file: File) {
        if (!file.isFile) throw WallpaperException("NOT_FOUND", "Mise à jour introuvable : télécharge-la à nouveau")
        if (!canInstall()) throw WallpaperException("INSTALL_PERMISSION", "Autorise Prisme à installer des applications")
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, APK_MIME)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
    }

    /** Réglage système « Installer des applis inconnues » pour Prisme (Android 8+). */
    @RequiresApi(26)
    fun permissionSettingsIntent(): Intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, "package:${context.packageName}".toUri())

    private fun verify(file: File) {
        val pm = context.packageManager
        val archive = archiveInfo(pm, file) ?: throw WallpaperException("UPDATE_INVALID", "Fichier de mise à jour illisible")
        if (archive.packageName != context.packageName) {
            throw WallpaperException("UPDATE_INVALID", "Ce fichier n'est pas une mise à jour de Prisme")
        }
        val installed = pm.getPackageInfo(context.packageName, SIGNATURE_FLAGS)
        if (PackageInfoCompat.getLongVersionCode(archive) <= PackageInfoCompat.getLongVersionCode(installed)) {
            throw WallpaperException("UPDATE_NOT_NEWER", "Cette version est déjà installée")
        }
        // Le système refuserait de toute façon une autre signature ; on le dit plus clairement avant.
        if (!sameSigner(signerDigests(archive), signerDigests(installed))) {
            throw WallpaperException("UPDATE_SIGNATURE", "Signature différente : mise à jour refusée")
        }
    }

    @Suppress("DEPRECATION")
    private fun archiveInfo(pm: PackageManager, file: File): PackageInfo? = pm.getPackageArchiveInfo(file.path, SIGNATURE_FLAGS)

    @Suppress("DEPRECATION")
    private fun signerDigests(info: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= 28) {
            val signing = info.signingInfo ?: return emptySet()
            if (signing.hasMultipleSigners()) signing.apkContentsSigners else signing.signingCertificateHistory
        } else {
            info.signatures
        }
        return signatures.orEmpty().map { sha256(it.toByteArray()) }.toSet()
    }

    companion object {
        const val APK_MIME = "application/vnd.android.package-archive"
        private const val APK_NAME = "prisme-update.apk"

        @Suppress("DEPRECATION")
        private val SIGNATURE_FLAGS =
            if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES

        /** Signataires inconnus d'un côté (anciens Android) : on laisse le système trancher. */
        fun sameSigner(update: Set<String>, installed: Set<String>): Boolean =
            update.isEmpty() || installed.isEmpty() || update.any { it in installed }

        fun sha256(bytes: ByteArray): String =
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }
}
