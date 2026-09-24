package expo.modules.flyrightliveupdate

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Fires at the instant a card's countdown has run out and posts the card
 * the JS side prepared for that moment ("LANDS IN" at take-off time,
 * "LANDED" at landing time) — the app itself may be asleep for hours. A
 * card the traveller has swiped away stays away. */
class LiveUpdateAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val journeyId = intent.getStringExtra(LiveUpdateNotifier.EXTRA_JOURNEY) ?: return
    val raw = intent.getStringExtra(LiveUpdateNotifier.EXTRA_CARD) ?: return
    val posted = LiveUpdateNotifier.isPosted(context, journeyId)
    android.util.Log.i("FlyRightLiveUpdate", "alarm for $journeyId fired, card still posted=$posted")
    if (!posted) return
    val card = try {
      LiveCard.fromJson(raw)
    } catch (error: Exception) {
      android.util.Log.w("FlyRightLiveUpdate", "scheduled card unreadable", error)
      return
    }
    LiveUpdateNotifier.notify(context, journeyId, card, live = true)
  }
}
