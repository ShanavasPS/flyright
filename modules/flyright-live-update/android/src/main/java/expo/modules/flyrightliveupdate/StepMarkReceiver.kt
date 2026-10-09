package expo.modules.flyrightliveupdate

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

/** The travel-day card's "I'm through security" button. Runs without
 * opening the app (it may not even be running): the mark waits in StepMarks
 * until the JS side records it (src/components/step-mark-sync.tsx), and the
 * card drops its button at once so the tap visibly landed. The iOS twin is
 * MarkTravelStep (plugins/assistant/FlyRightStepIntent.swift). */
class StepMarkReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val journeyId = intent.getStringExtra(LiveUpdateNotifier.EXTRA_JOURNEY) ?: return
    val stage = intent.getStringExtra(LiveUpdateNotifier.EXTRA_STAGE) ?: return
    StepMarks.add(context, journeyId, stage)
    LiveUpdateNotifier.dropAction(context, journeyId)
  }
}

/** Steps marked from the card, waiting for the JS side. A mark older than
 * half a day is dropped: the travel day it belonged to is over. */
object StepMarks {
  private const val PREFS = "flyright.stepmarks"
  private const val KEY = "pending"
  private const val MAX_AGE_SECONDS = 12 * 3600

  /** Set by the module while JS is alive, so a tap is recorded at once. */
  @Volatile var listener: (() -> Unit)? = null

  fun add(context: Context, journeyId: String, stage: String) {
    synchronized(this) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val marks = JSONArray(prefs.getString(KEY, "[]"))
      marks.put(
        JSONObject()
          .put("journeyId", journeyId)
          .put("stage", stage)
          .put("at", System.currentTimeMillis() / 1000.0),
      )
      val kept = JSONArray()
      for (i in maxOf(0, marks.length() - 20) until marks.length()) kept.put(marks.get(i))
      prefs.edit().putString(KEY, kept.toString()).apply()
    }
    listener?.invoke()
  }

  fun take(context: Context): List<Map<String, Any>> {
    val raw = synchronized(this) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val value = prefs.getString(KEY, "[]") ?: "[]"
      prefs.edit().remove(KEY).apply()
      value
    }
    val now = System.currentTimeMillis() / 1000.0
    val marks = JSONArray(raw)
    return (0 until marks.length())
      .map { marks.getJSONObject(it) }
      .filter { now - it.optDouble("at", 0.0) < MAX_AGE_SECONDS }
      .map { mapOf("journeyId" to it.optString("journeyId"), "stage" to it.optString("stage"), "at" to it.optDouble("at")) }
  }
}
