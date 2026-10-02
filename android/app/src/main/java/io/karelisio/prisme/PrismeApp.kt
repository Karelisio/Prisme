package io.karelisio.prisme

import android.app.Application
import android.content.res.Configuration
import io.karelisio.prisme.automation.AutomationRunner
import io.karelisio.prisme.automation.AutomationScheduler
import io.karelisio.prisme.automation.AutomationStore
import io.karelisio.prisme.automation.DynamicMode
import io.karelisio.prisme.system.ErrorLog

class PrismeApp : Application() {
    private var darkMode: Boolean? = null

    override fun onCreate() {
        super.onCreate()
        ErrorLog.install(this)
        darkMode = AutomationRunner.darkMode(this)
    }

    /** Mode sombre basculé pendant que l'app tourne : le fond « Mode sombre » suit tout de suite. */
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val dark = AutomationRunner.darkMode(this)
        if (dark == darkMode) return
        darkMode = dark
        val dynamic = AutomationStore(this).config().dynamic
        if (dynamic.enabled && dynamic.mode is DynamicMode.Theme) AutomationScheduler.runNow(this)
    }
}
