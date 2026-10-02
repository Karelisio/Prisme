package io.karelisio.prisme

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import io.karelisio.prisme.automation.PrismeAutomationPlugin
import io.karelisio.prisme.library.PrismeLibraryPlugin
import io.karelisio.prisme.live.PrismeLivePlugin
import io.karelisio.prisme.music.PrismeMusicPlugin
import io.karelisio.prisme.system.PrismeSystemPlugin
import io.karelisio.prisme.wallpaper.PrismeWallpaperPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(PrismeWallpaperPlugin::class.java)
        registerPlugin(PrismeAutomationPlugin::class.java)
        registerPlugin(PrismeLivePlugin::class.java)
        registerPlugin(PrismeSystemPlugin::class.java)
        registerPlugin(PrismeMusicPlugin::class.java)
        registerPlugin(PrismeLibraryPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
