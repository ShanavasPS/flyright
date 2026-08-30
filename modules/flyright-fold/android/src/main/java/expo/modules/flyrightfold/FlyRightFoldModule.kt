package expo.modules.flyrightfold

import android.app.Activity
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** Android half of the foldable-posture bridge — the JS contract lives in
 * modules/flyright-fold/index.ts (field names must match; change together).
 *
 * Wraps androidx.window's WindowInfoTracker: emits an onFoldChange event with
 * the current FoldingFeature (posture, hinge orientation, hinge bounds in px,
 * whether the hinge separates the display) whenever the device posture or
 * window layout changes. Devices without a folding feature (phones, tablets)
 * simply report posture "none" — the JS side treats that as "no special
 * layout". Collection follows JS observation (OnStartObserving /
 * OnStopObserving), so there is no cost while nothing listens. */
class FlyRightFoldModule : Module() {
  private var scope: CoroutineScope? = null
  private var lastState: Map<String, Any?> = NO_FOLD

  override fun definition() = ModuleDefinition {
    Name("FlyRightFold")

    Events("onFoldChange")

    // Last known state for synchronous first render; the event stream keeps
    // it fresh afterwards.
    Function("getState") { lastState }

    OnStartObserving { startTracking() }
    OnStopObserving { stopTracking() }
    OnDestroy { stopTracking() }
  }

  private fun startTracking() {
    if (scope != null) return
    val activity: Activity = appContext.currentActivity ?: return
    val tracker = WindowInfoTracker.getOrCreate(activity)
    val newScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    scope = newScope
    newScope.launch {
      tracker.windowLayoutInfo(activity).collect { info: WindowLayoutInfo ->
        val state = info.toFoldState()
        lastState = state
        sendEvent("onFoldChange", state)
      }
    }
  }

  private fun stopTracking() {
    scope?.cancel()
    scope = null
  }

  private fun WindowLayoutInfo.toFoldState(): Map<String, Any?> {
    val fold = displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
      ?: return NO_FOLD
    return mapOf(
      "posture" to when (fold.state) {
        FoldingFeature.State.HALF_OPENED -> "halfOpened"
        else -> "flat"
      },
      "orientation" to when (fold.orientation) {
        FoldingFeature.Orientation.HORIZONTAL -> "horizontal"
        else -> "vertical"
      },
      "isSeparating" to fold.isSeparating,
      "hingeBounds" to mapOf(
        "left" to fold.bounds.left,
        "top" to fold.bounds.top,
        "right" to fold.bounds.right,
        "bottom" to fold.bounds.bottom,
      ),
    )
  }

  private companion object {
    val NO_FOLD: Map<String, Any?> = mapOf(
      "posture" to "none",
      "orientation" to null,
      "isSeparating" to false,
      "hingeBounds" to null,
    )
  }
}
