package io.karelisio.prisme

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import io.karelisio.prisme.wallpaper.PrismeWallpaperPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(PrismeWallpaperPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
