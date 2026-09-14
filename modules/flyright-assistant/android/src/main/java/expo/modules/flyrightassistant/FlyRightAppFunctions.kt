package expo.modules.flyrightassistant

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import androidx.appfunctions.AppFunctionContext
import androidx.appfunctions.service.AppFunction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Navigation only: sensitive trip data stays behind the app's account-scoped UI. */
class FlyRightAppFunctions {
  /**
   * Open the traveller's next saved flight in FlyRight, including an ongoing flight.
   * The app finds the flight after opening; this does not return flight details.
   * @return A PendingIntent the caller must launch to display the flight in FlyRight.
   */
  @AppFunction(isDescribedByKDoc = true)
  suspend fun showNextFlight(appFunctionContext: AppFunctionContext): PendingIntent =
    navigation(appFunctionContext, "next-flight", 1)

  /**
   * Open the boarding pass saved for the traveller's next flight in FlyRight.
   * If no pass is saved, the app offers to open that flight to add one. This does
   * not check in, fetch a pass from an airline, or return a barcode to the caller.
   * @return A PendingIntent the caller must launch to display the boarding pass in FlyRight.
   */
  @AppFunction(isDescribedByKDoc = true)
  suspend fun showBoardingPass(appFunctionContext: AppFunctionContext): PendingIntent =
    navigation(appFunctionContext, "boarding-pass", 2)

  /**
   * Open FlyRight's add-flight form to look up, scan, or manually enter a flight.
   * The traveller reviews and saves it inside the app. No flight is booked or
   * saved merely by calling this function.
   * @return A PendingIntent the caller must launch to display the add-flight form.
   */
  @AppFunction(isDescribedByKDoc = true)
  suspend fun addFlight(appFunctionContext: AppFunctionContext): PendingIntent =
    navigation(appFunctionContext, "add-flight", 3)

  private suspend fun navigation(context: AppFunctionContext, action: String, requestCode: Int): PendingIntent =
    withContext(Dispatchers.IO) {
      val app = context.context.applicationContext
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("flyright://assistant/$action")).apply {
        component = ComponentName(app.packageName, "${app.packageName}.MainActivity")
        setPackage(app.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      // Returning an immutable, explicit PendingIntent lets the authorized caller
      // launch the UI without a background service attempting startActivity().
      PendingIntent.getActivity(app, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
}
