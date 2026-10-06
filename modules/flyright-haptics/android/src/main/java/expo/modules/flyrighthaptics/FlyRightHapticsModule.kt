package expo.modules.flyrighthaptics

import android.content.Context
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.VibrationEffect.Composition
import android.os.Vibrator
import android.os.VibratorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Android half of the travel-day haptics — the JS contract lives in
 * modules/flyright-haptics/index.ts (moment names must match).
 *
 * Builds each moment from the vibrator's haptic primitives (Android 12+):
 * a thud for the main gear, a slow rise for the take-off roll. `play`
 * returns false when the device lacks a primitive a moment needs or runs an
 * older Android, and the caller falls back to a preset. Played with touch
 * usage, so the system's "Touch feedback" switch silences it like any
 * other haptic. */
class FlyRightHapticsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FlyRightHaptics")

    AsyncFunction("play") { moment: String ->
      play(moment)
    }
  }

  private fun play(moment: String): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false
    val vibrator = vibrator() ?: return false
    if (!vibrator.hasVibrator()) return false
    val steps = pattern(moment) ?: return false
    val needed = steps.map { it.primitive }.distinct().toIntArray()
    if (!vibrator.areAllPrimitivesSupported(*needed)) return false

    val composition = VibrationEffect.startComposition()
    for (step in steps) composition.addPrimitive(step.primitive, step.scale, step.delayMs)
    val effect = composition.compose()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
    } else {
      vibrator.vibrate(effect)
    }
    return true
  }

  @androidx.annotation.RequiresApi(Build.VERSION_CODES.S)
  private fun vibrator(): Vibrator? {
    val context = appContext.reactContext ?: return null
    return (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
  }

  /** One primitive; `delayMs` is the gap after the previous one ends. */
  private data class Step(val primitive: Int, val scale: Float, val delayMs: Int = 0)

  private fun pattern(moment: String): List<Step>? = when (moment) {
    // The gate reader: two crisp beeps.
    "boarding" -> listOf(
      Step(Composition.PRIMITIVE_CLICK, 0.7f),
      Step(Composition.PRIMITIVE_CLICK, 0.7f, 90),
    )
    // The roll builds and stops dead as the wheels leave; gear up a beat later.
    "takeOff" -> listOf(
      Step(Composition.PRIMITIVE_SLOW_RISE, 0.8f),
      Step(Composition.PRIMITIVE_TICK, 0.6f, 140),
    )
    // Main gear thud, the roll-out fading, nose gear down.
    "landed" -> listOf(
      Step(Composition.PRIMITIVE_THUD, 1f),
      Step(Composition.PRIMITIVE_QUICK_FALL, 0.5f),
      Step(Composition.PRIMITIVE_THUD, 0.5f, 120),
    )
    // Coins: three rising ticks and a lift.
    "owed" -> listOf(
      Step(Composition.PRIMITIVE_TICK, 0.45f),
      Step(Composition.PRIMITIVE_TICK, 0.65f, 60),
      Step(Composition.PRIMITIVE_TICK, 0.9f, 60),
      Step(Composition.PRIMITIVE_QUICK_RISE, 0.5f, 40),
    )
    else -> null
  }
}
