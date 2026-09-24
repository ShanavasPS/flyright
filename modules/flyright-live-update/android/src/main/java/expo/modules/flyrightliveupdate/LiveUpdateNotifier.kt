package expo.modules.flyrightliveupdate

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/** One rendering of the travel-day card, free of the Expo Record so the
 * alarm receiver can rebuild it from JSON with no JS running. The field
 * names are the JS contract (LiveUpdateContent in index.ts). */
data class LiveCard(
  val title: String,
  val headline: String,
  val subtitle: String,
  val fromCode: String,
  val toCode: String,
  val flightLabel: String,
  val progress: Double,
  val compactLabel: String,
  /** ms since epoch the countdown runs to; 0 = none. */
  val countdownEnd: Long,
  val gate: String?,
  val terminal: String?,
  val delayLabel: String?,
  val emphasis: String,
  val leadTitle: String,
  val leadText: String,
  val tone: String,
) {
  fun toJson(): String =
    JSONObject()
      .put("title", title)
      .put("headline", headline)
      .put("subtitle", subtitle)
      .put("fromCode", fromCode)
      .put("toCode", toCode)
      .put("flightLabel", flightLabel)
      .put("progress", progress)
      .put("compactLabel", compactLabel)
      .put("countdownEnd", countdownEnd)
      .put("gate", gate ?: JSONObject.NULL)
      .put("terminal", terminal ?: JSONObject.NULL)
      .put("delayLabel", delayLabel ?: JSONObject.NULL)
      .put("emphasis", emphasis)
      .put("leadTitle", leadTitle)
      .put("leadText", leadText)
      .put("tone", tone)
      .toString()

  companion object {
    fun fromJson(raw: String): LiveCard {
      val o = JSONObject(raw)
      fun text(key: String): String? = if (o.isNull(key)) null else o.optString(key)
      return LiveCard(
        title = o.optString("title"),
        headline = o.optString("headline"),
        subtitle = o.optString("subtitle"),
        fromCode = o.optString("fromCode"),
        toCode = o.optString("toCode"),
        flightLabel = o.optString("flightLabel"),
        progress = o.optDouble("progress", 0.0),
        compactLabel = o.optString("compactLabel"),
        countdownEnd = o.optLong("countdownEnd", 0L),
        gate = text("gate"),
        terminal = text("terminal"),
        delayLabel = text("delayLabel"),
        emphasis = o.optString("emphasis", "none"),
        leadTitle = o.optString("leadTitle"),
        leadText = o.optString("leadText"),
        tone = o.optString("tone"),
      )
    }
  }
}

/** A card to post at a later instant — what the surface should read once
 * its countdown has run out, decided now by the JS side (liveContentSchedule
 * in src/services/travel-day.ts) because the app may not be running then. */
data class ScheduledCard(val at: Long, val card: LiveCard)

/** Builds and posts the travel-day card, and arms the alarms that swap it
 * for the next one at take-off and landing time. Shared by the module (the
 * JS side's post/end) and the alarm receiver, which has no module instance. */
object LiveUpdateNotifier {
  // Shared with the JS side's expo-notifications channel of the same id — no
  // prefixing happens on either side, so both post into one user-visible
  // "Travel day" channel.
  private const val CHANNEL_ID = "travel-day"

  // One notification per journey: fixed id, journey id as the tag.
  const val NOTIFICATION_ID = 4207

  /** How many later cards a post may arm. Take-off, landing, and one spare. */
  const val MAX_SCHEDULED = 4

  const val EXTRA_JOURNEY = "journeyId"
  const val EXTRA_CARD = "card"
  const val EXTRA_INDEX = "index"

  // Payout green / brand navy from src/constants/theme.ts.
  private const val COLOR_ON_TIME = 0xFF0FA362.toInt()
  private const val COLOR_BRAND = 0xFF13294B.toInt()
  // Amber for a late flight (theme.warning) — the lead rule's delay tone.
  private const val COLOR_LATE = 0xFFA9720B.toInt()

  private fun manager(context: Context): NotificationManager =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  /** Post or replace-in-place the journey's card, and re-arm its schedule:
   * every post cancels the alarms of the last one, so a fresh reconcile
   * (new facts, a stage tap) always wins over a stale plan. */
  fun post(context: Context, journeyId: String, card: LiveCard, live: Boolean, scheduled: List<ScheduledCard>) {
    notify(context, journeyId, card, live)
    cancelScheduled(context, journeyId)
    if (live) arm(context, journeyId, scheduled)
  }

  fun cancel(context: Context, journeyId: String) {
    cancelScheduled(context, journeyId)
    manager(context).cancel(journeyId, NOTIFICATION_ID)
  }

  /** Whether the journey's card is still up — a traveller who swiped it away
   * must not get it back from an alarm; the next reconcile decides. */
  fun isPosted(context: Context, journeyId: String): Boolean =
    manager(context).activeNotifications.any { it.tag == journeyId && it.id == NOTIFICATION_ID }

  fun canPostPromoted(context: Context): Boolean =
    Build.VERSION.SDK_INT >= 36 && manager(context).canPostPromotedNotifications()

  fun notify(context: Context, journeyId: String, content: LiveCard, live: Boolean) {
    val manager = manager(context)
    ensureChannel(manager)

    val route =
      if (content.fromCode.isNotEmpty() && content.toCode.isNotEmpty()) {
        listOf("${content.fromCode} → ${content.toCode}", content.flightLabel)
          .filter { it.isNotEmpty() }
          .joinToString(" · ")
      } else {
        content.title
      }
    val facts = listOfNotNull(
      content.gate?.takeIf { it.isNotEmpty() }?.let { "Gate $it" },
      content.terminal?.takeIf { it.isNotEmpty() }?.let { "Terminal $it" },
      content.delayLabel?.takeIf { it.isNotEmpty() },
    ).joinToString(" · ")

    val builder =
      if (Build.VERSION.SDK_INT >= 26) {
        Notification.Builder(context, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context).setPriority(Notification.PRIORITY_DEFAULT)
      }
    // The content line leads with the time fact ("Flight in 3h") and follows
    // with the next step — the headline has no slot of its own in a
    // notification, and the status-bar chip only shows the compact word.
    val legacyLine = listOf(content.headline, content.subtitle).filter { it.isNotEmpty() }.joinToString(" · ")
    // The lead rule, when the JS side sends it: the clock label and the one
    // fact that matters now as the title, its sub line (led by "+46 min"
    // when late) as the text, and the route codes quietly beneath — no
    // flight number, no next-step sentence. The countdown itself is the
    // notification's own clock (below), ticked by the OS.
    val lead = content.leadTitle.isNotEmpty()
    val routeCodes =
      if (content.fromCode.isNotEmpty() && content.toCode.isNotEmpty()) "${content.fromCode} → ${content.toCode}" else ""
    val title = if (lead) content.leadTitle else route
    val line = if (lead) content.leadText else legacyLine
    val late = content.tone == "delay" || (!lead && content.emphasis == "delay")
    val accent = when {
      late -> COLOR_LATE
      content.tone == "boarding" -> COLOR_ON_TIME
      else -> COLOR_BRAND
    }
    builder
      // The brand mark, not a generic plane: it's what shows in the status
      // bar and the Android 16 Live Update chip.
      .setSmallIcon(R.drawable.flyright_live_brand)
      .setContentTitle(title)
      .setContentText(line)
      .setOnlyAlertOnce(true)
      .setOngoing(live)
      .setAutoCancel(!live)
      .setColor(accent)
      .setContentIntent(tapIntent(context, journeyId))
    // The lead already names the fact; beneath it only which trip this is.
    val sub = if (lead) routeCodes else facts
    if (sub.isNotEmpty()) builder.setSubText(sub)

    // The countdown, on every Android version: a future `when` drawn as a
    // count-down chronometer in the notification's own header, ticked by
    // the OS with no help from us. "Departs in" with nothing after it was
    // what a traveller on a phone without the Android 16 chip saw all
    // flight (2026-09-24). The last two minutes belong to "Departing now".
    val countdownEnd = content.countdownEnd
    val counting = live && countdownEnd > System.currentTimeMillis() + 2 * 60_000L
    if (counting) {
      builder.setWhen(countdownEnd).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
    } else {
      builder.setShowWhen(false)
    }

    val percent = (content.progress.coerceIn(0.0, 1.0) * 100).toInt()
    if (Build.VERSION.SDK_INT >= 36) {
      val track = if (late) COLOR_LATE else COLOR_ON_TIME
      builder.setStyle(
        Notification.ProgressStyle()
          // Full-length single segment; styled-by-progress dims the un-flown
          // remainder so the tracker plane splits flown from ahead. Progress
          // is flight progress: the plane waits at the origin until take-off.
          .setProgressSegments(
            listOf(Notification.ProgressStyle.Segment(100).setColor(track)),
          )
          .setProgress(percent)
          .setStyledByProgress(true)
          .setProgressTrackerIcon(
            Icon.createWithResource(context, R.drawable.flyright_live_tracker),
          ),
      )
      if (live) {
        // The promotion request (EXTRA_REQUEST_PROMOTED_ONGOING — the constant
        // ships in the 16 QPR SDK, the string works from 36): honored only
        // when the notification keeps its promotable characteristics and the
        // user hasn't revoked the app's Live Update privilege;
        // FLAG_PROMOTED_ONGOING itself is system-set, never app-set.
        builder.addExtras(
          android.os.Bundle().apply { putBoolean("android.requestPromotedOngoing", true) },
        )
        // The chip has one slot and short critical text wins over the time,
        // so while a countdown runs the chip shows THAT (the `when` above,
        // as a live minute-level countdown, no seconds). The compact word
        // takes the slot back once the countdown is over.
        if (!counting && content.compactLabel.isNotEmpty()) {
          builder.setShortCriticalText(content.compactLabel)
        }
      }
    } else {
      builder.setProgress(100, percent, false)
      val big = listOf(line, sub).filter { it.isNotEmpty() }.joinToString("\n")
      if (big.isNotEmpty()) builder.setStyle(Notification.BigTextStyle().bigText(big))
    }

    val notification = builder.build()
    if (Build.VERSION.SDK_INT >= 36 && live) {
      android.util.Log.i(
        "FlyRightLiveUpdate",
        "canPostPromoted=${manager.canPostPromotedNotifications()} " +
          "promotable=${notification.hasPromotableCharacteristics()} " +
          "requestExtra=${notification.extras.getBoolean("android.requestPromotedOngoing")} " +
          "counting=$counting",
      )
    }
    manager.notify(journeyId, NOTIFICATION_ID, notification)
  }

  /** Idempotent, and intentionally identical to the JS ensureChannel — the
   * silent glance channel, never a sound or buzz. */
  private fun ensureChannel(manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < 26) return
    val channel = NotificationChannel(CHANNEL_ID, "Travel day", NotificationManager.IMPORTANCE_DEFAULT)
    channel.setSound(null, null)
    channel.enableVibration(false)
    manager.createNotificationChannel(channel)
  }

  private fun tapIntent(context: Context, journeyId: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("flyright:///journey/$journeyId")).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return PendingIntent.getActivity(
      context,
      journeyId.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  // -- the schedule -----------------------------------------------------------

  private fun alarmIntent(context: Context, journeyId: String, index: Int, card: LiveCard?, flags: Int): PendingIntent? {
    val intent = Intent(context, LiveUpdateAlarmReceiver::class.java).apply {
      action = "expo.modules.flyrightliveupdate.CARD"
      // The data URI makes each (journey, index) its own intent for the
      // alarm manager, whatever the extras hold.
      data = Uri.parse("flyright-live://card/${Uri.encode(journeyId)}/$index")
      putExtra(EXTRA_JOURNEY, journeyId)
      putExtra(EXTRA_INDEX, index)
      if (card != null) putExtra(EXTRA_CARD, card.toJson())
    }
    return PendingIntent.getBroadcast(context, index, intent, flags or PendingIntent.FLAG_IMMUTABLE)
  }

  /** How late a card may arrive: a windowed alarm is honoured within this of
   * its time (the platform floor is ten minutes without the exact-alarm
   * permission, which is not asked of the traveller). */
  private const val WINDOW_MS = 10 * 60_000L

  /** Two alarms per card, and the receiver is idempotent so both may land:
   * a windowed one, because a plain inexact alarm may be delayed by up to
   * three quarters of its wait (a "Lands in" card an hour and a half after
   * take-off), and an allow-while-idle one, because a windowed alarm sits
   * out Doze until its next maintenance window while the phone lies still
   * in a pocket all flight. Whichever fires first posts the card; the other
   * finds the same card and re-posts it silently (setOnlyAlertOnce). */
  private fun arm(context: Context, journeyId: String, scheduled: List<ScheduledCard>) {
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val now = System.currentTimeMillis()
    android.util.Log.i(
      "FlyRightLiveUpdate",
      "arming ${scheduled.size} card(s) for $journeyId: ${scheduled.joinToString { "${it.at - now}ms → ${it.card.leadTitle}" }}",
    )
    scheduled.take(MAX_SCHEDULED).forEachIndexed { index, item ->
      if (item.at <= now) return@forEachIndexed
      val windowed = alarmIntent(context, journeyId, index, item.card, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
      alarms.setWindow(AlarmManager.RTC_WAKEUP, item.at, WINDOW_MS, windowed)
      if (Build.VERSION.SDK_INT >= 23) {
        val idle = alarmIntent(context, journeyId, index + MAX_SCHEDULED, item.card, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.at, idle)
      }
    }
  }

  private fun cancelScheduled(context: Context, journeyId: String) {
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    for (index in 0 until 2 * MAX_SCHEDULED) {
      val pending = alarmIntent(context, journeyId, index, null, PendingIntent.FLAG_NO_CREATE) ?: continue
      alarms.cancel(pending)
      pending.cancel()
    }
  }
}
