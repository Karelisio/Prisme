package io.karelisio.prisme.quick

import io.karelisio.prisme.automation.AutomationConfig
import io.karelisio.prisme.automation.DynamicConfig
import io.karelisio.prisme.automation.DynamicMode
import io.karelisio.prisme.automation.FocusConfig
import io.karelisio.prisme.automation.FocusSchedule
import io.karelisio.prisme.automation.Moment
import io.karelisio.prisme.automation.RotationConfig
import io.karelisio.prisme.automation.TimeSlot
import io.karelisio.prisme.wallpaper.WallpaperRef
import io.karelisio.prisme.wallpaper.WallpaperTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class QuickPoolTest {
    private fun ref(id: String) = WallpaperRef(id, "https://x/$id.jpg")
    private val monday10h = Moment(epochMillis = 0, dayOfWeek = 1, minuteOfDay = 600, month = 3)

    @Test
    fun `lecture de la réserve envoyée par l'app`() {
        val pool = QuickPool.parse("""{"target":"lock","items":[{"id":"a","uri":"https://x/a.jpg"},{"id":"b"}]}""")
        assertEquals(WallpaperTarget.LOCK, pool.target)
        assertEquals(listOf("a"), pool.items.map { it.id })
        assertEquals(QuickPool.Pool(), QuickPool.parse("pas du json"))
        assertEquals(WallpaperTarget.BOTH, QuickPool.parse("""{"items":[]}""").target)
    }

    @Test
    fun `tirage sans reprendre le fond actuel`() {
        val items = listOf(ref("a"), ref("b"), ref("c"))
        repeat(50) { seed -> assertNotEquals("b", QuickPool.pick(items, "b", Random(seed))?.id) }
        // Un seul favori : on le reprend plutôt que de ne rien faire.
        assertEquals("a", QuickPool.pick(listOf(ref("a")), "a", Random(1))?.id)
        assertNull(QuickPool.pick(emptyList(), null, Random(1)))
    }

    @Test
    fun `fond suivant, la rotation décide sauf automatisme prioritaire`() {
        val rotation = RotationConfig(enabled = true, items = listOf(ref("r")))
        assertTrue(QuickPool.rotationDrivesNext(AutomationConfig(rotation = rotation), monday10h))
        assertFalse(QuickPool.rotationDrivesNext(AutomationConfig(rotation = rotation.copy(enabled = false)), monday10h))
        assertFalse(QuickPool.rotationDrivesNext(AutomationConfig(rotation = rotation.copy(items = emptyList())), monday10h))

        val dynamic = DynamicConfig(enabled = true, mode = DynamicMode.Time(listOf(TimeSlot(0, ref("d")))))
        assertFalse(QuickPool.rotationDrivesNext(AutomationConfig(rotation = rotation, dynamic = dynamic), monday10h))

        val focus = FocusConfig(enabled = true, ref = ref("f"), schedules = listOf(FocusSchedule(setOf(1), 540, 720)))
        assertFalse(QuickPool.rotationDrivesNext(AutomationConfig(rotation = rotation, focus = focus), monday10h))
        // Mode focus programmé mais pas en cours : la rotation garde la main.
        assertTrue(QuickPool.rotationDrivesNext(AutomationConfig(rotation = rotation, focus = focus), monday10h.copy(minuteOfDay = 800)))

        // Fête ou lieu en cours sur l'écran de la rotation : favori au hasard ; sur l'autre écran : rotation.
        val homeRotation = AutomationConfig(rotation = rotation.copy(target = WallpaperTarget.HOME))
        assertFalse(QuickPool.rotationDrivesNext(homeRotation, monday10h, WallpaperTarget.BOTH))
        assertFalse(QuickPool.rotationDrivesNext(homeRotation, monday10h, WallpaperTarget.HOME))
        assertTrue(QuickPool.rotationDrivesNext(homeRotation, monday10h, WallpaperTarget.LOCK))
        assertFalse(QuickPool.rotationDrivesNext(AutomationConfig(rotation = rotation), monday10h, WallpaperTarget.LOCK))
    }
}
