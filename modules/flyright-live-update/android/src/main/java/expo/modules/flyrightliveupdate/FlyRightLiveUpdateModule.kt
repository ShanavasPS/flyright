package expo.modules.flyrightliveupdate

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Android half of the travel-day lock-screen surface — the sibling of the
 * iOS Live Activity in src/services/live-activity.ts. On Android 16+ it posts
 * a promoted Live Update (ProgressStyle route bar, status-bar chip via
 * setShortCriticalText); on older versions the same content degrades to an
 * ongoing notification with a classic progress bar. The field names below are
 * the contract with the JS wrapper's LiveUpdateContent — change them together. */
class LiveUpdateContent : Record {
  @Field val title: String = ""
  @Field val subtitle: String = ""
  @Field val fromCode: String = ""
  @Field val toCode: String = ""
  @Field val flightLabel: String = ""
  @Field val progress: Double = 0.0
  @Field val compactLabel: String = ""
  @Field val gate: String? = null
  @Field val terminal: String? = null
  @Field val delayLabel: String? = null
  @Field val emphasis: String = "none"
}

// Shared with the JS side's expo-notifications channel of the same id — no
// prefixing happens on either side, so both post into one user-visible
// "Travel day" channel.
private const val CHANNEL_ID = "travel-day"

// One notification per journey: fixed id, journey id as the tag.
private const val NOTIFICATION_ID = 4207

// Payout green / delay red / brand navy from src/constants/theme.ts.
private const val COLOR_ON_TIME = 0xFF0FA362.toInt()
private const val COLOR_DELAY = 0xFFD93036.toInt()
private const val COLOR_BRAND = 0xFF13294B.toInt()

class FlyRightLiveUpdateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FlyRightLiveUpdate")

    // Post or replace-in-place the journey's ongoing card.
    Function("post") { journeyId: String, content: LiveUpdateContent ->
      notify(journeyId, content, live = true)
    }

    // End the surface: with content, leave a dismissible final card (the
    // Android analogue of the iOS dimmed post-end state); without, remove it.
    Function("end") { journeyId: String, content: LiveUpdateContent? ->
      if (content == null) {
        manager.cancel(journeyId, NOTIFICATION_ID)
      } else {
        notify(journeyId, content, live = false)
      }
    }

    // Whether the OS will grant Live Update promotion (Android 16+, per-app
    // user setting). Posting works either way — this is for diagnostics.
    Function("canPostPromoted") {
      Build.VERSION.SDK_INT >= 36 && manager.canPostPromotedNotifications()
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private val manager: NotificationManager
    get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun notify(journeyId: String, content: LiveUpdateContent, live: Boolean) {
    ensureChannel()

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
    builder
      .setSmallIcon(R.drawable.flyright_live_flight)
      .setContentTitle(route)
      .setContentText(content.subtitle)
      .setOnlyAlertOnce(true)
      .setOngoing(live)
      .setAutoCancel(!live)
      .setColor(if (content.emphasis == "delay") COLOR_DELAY else COLOR_BRAND)
      .setContentIntent(tapIntent(journeyId))
    if (facts.isNotEmpty()) builder.setSubText(facts)

    val percent = (content.progress.coerceIn(0.0, 1.0) * 100).toInt()
    if (Build.VERSION.SDK_INT >= 36) {
      val track = if (content.emphasis == "delay") COLOR_DELAY else COLOR_ON_TIME
      builder.setStyle(
        Notification.ProgressStyle()
          // Full-length single segment; styled-by-progress dims the un-flown
          // remainder so the tracker plane splits flown from ahead.
          .setProgressSegments(
            listOf(Notification.ProgressStyle.Segment(100).setColor(track)),
          )
          .setProgress(percent)
          .setStyledByProgress(true)
          .setProgressTrackerIcon(
            Icon.createWithResource(context, R.drawable.flyright_live_flight),
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
        if (content.compactLabel.isNotEmpty()) {
          builder.setShortCriticalText(content.compactLabel)
        }
      }
    } else {
      builder.setProgress(100, percent, false)
      val big = listOf(content.subtitle, facts).filter { it.isNotEmpty() }.joinToString("\n")
      if (big.isNotEmpty()) builder.setStyle(Notification.BigTextStyle().bigText(big))
    }

    val notification = builder.build()
    if (Build.VERSION.SDK_INT >= 36 && live) {
      android.util.Log.i(
        "FlyRightLiveUpdate",
        "canPostPromoted=${manager.canPostPromotedNotifications()} " +
          "promotable=${notification.hasPromotableCharacteristics()} " +
          "requestExtra=${notification.extras.getBoolean("android.requestPromotedOngoing")}",
      )
    }
    manager.notify(journeyId, NOTIFICATION_ID, notification)
  }

  /** Idempotent, and intentionally identical to the JS ensureChannel — the
   * silent glance channel, never a sound or buzz. */
  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < 26) return
    val channel = NotificationChannel(CHANNEL_ID, "Travel day", NotificationManager.IMPORTANCE_DEFAULT)
    channel.setSound(null, null)
    channel.enableVibration(false)
    manager.createNotificationChannel(channel)
  }

  private fun tapIntent(journeyId: String): PendingIntent {
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
}
