package expo.modules.flyrighttestlab

import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Android half of modules/flyright-test-lab/index.ts.
 *
 * Firebase Test Lab — which runs Google Play's pre-launch report robots on
 * every upload — sets the system setting `firebase.test.lab` to "true" on its
 * devices. Those are real phones, so Device.isDevice can't tell them apart
 * from a traveller's; this can. */
class FlyRightTestLabModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FlyRightTestLab")

    Constant("isTestLab") {
      val resolver = appContext.reactContext?.contentResolver ?: return@Constant false
      runCatching { Settings.System.getString(resolver, "firebase.test.lab") == "true" }
        .getOrDefault(false)
    }
  }
}
