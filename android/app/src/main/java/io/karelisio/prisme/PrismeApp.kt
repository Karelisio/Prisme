package io.karelisio.prisme

import android.app.Application
import io.karelisio.prisme.system.ErrorLog

class PrismeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ErrorLog.install(this)
    }
}
