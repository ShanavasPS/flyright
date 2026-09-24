package expo.modules.flyrightliveupdate

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Android half of the travel-day lock-screen surface — the sibling of the
 * iOS Live Activity in src/services/live-activity.ts. On Android 16+ it posts
 * a promoted Live Update (ProgressStyle route bar, status-bar chip); on older
 * versions the same content degrades to an ongoing notification with a
 * classic progress bar. Both draw the countdown as the notification's own
 * chronometer. The field names below are the contract with the JS wrapper's
 * LiveUpdateContent — change them together. The rendering itself lives in
 * LiveUpdateNotifier, shared with the alarm receiver that swaps the card at
 * take-off and landing time while the app is asleep. */
class LiveUpdateContent : Record {
  @Field val title: String = ""
  /** "Flight in 3h" / "Lands in 40 min" / "Landed" — leads the content line. */
  @Field val headline: String = ""
  @Field val subtitle: String = ""
  @Field val fromCode: String = ""
  @Field val toCode: String = ""
  @Field val flightLabel: String = ""
  /** Flight progress 0..1: zero until departure, then time-based, 1 landed. */
  @Field val progress: Double = 0.0
  @Field val compactLabel: String = ""
  /** ms since epoch the countdown runs to; 0 = none. */
  @Field val countdownEnd: Double = 0.0
  @Field val gate: String? = null
  @Field val terminal: String? = null
  @Field val delayLabel: String? = null
  @Field val emphasis: String = "none"
  /** The lead rule's lines: "Departs in · Gate 53" over "Boards 15:30".
   * Empty from an older JS side, which keeps the route/headline layout. */
  @Field val leadTitle: String = ""
  @Field val leadText: String = ""
  /** "normal" | "boarding" | "delay" | "landed" — the card's accent. */
  @Field val tone: String = ""

  fun toCard(): LiveCard =
    LiveCard(
      title = title,
      headline = headline,
      subtitle = subtitle,
      fromCode = fromCode,
      toCode = toCode,
      flightLabel = flightLabel,
      progress = progress,
      compactLabel = compactLabel,
      countdownEnd = countdownEnd.toLong(),
      gate = gate,
      terminal = terminal,
      delayLabel = delayLabel,
      emphasis = emphasis,
      leadTitle = leadTitle,
      leadText = leadText,
      tone = tone,
    )
}

/** A card for later: `at` (ms since epoch) and what to show from then. */
class ScheduledLiveUpdate : Record {
  @Field val at: Double = 0.0
  @Field val content: LiveUpdateContent = LiveUpdateContent()
}

class FlyRightLiveUpdateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FlyRightLiveUpdate")

    // Post or replace-in-place the journey's ongoing card, with the cards to
    // swap in at the moments its countdowns run out.
    Function("post") { journeyId: String, content: LiveUpdateContent, scheduled: List<ScheduledLiveUpdate>? ->
      LiveUpdateNotifier.post(
        context,
        journeyId,
        content.toCard(),
        live = true,
        scheduled = (scheduled ?: emptyList()).map { ScheduledCard(it.at.toLong(), it.content.toCard()) },
      )
    }

    // End the surface: with content, leave a dismissible final card (the
    // Android analogue of the iOS dimmed post-end state); without, remove it.
    Function("end") { journeyId: String, content: LiveUpdateContent? ->
      if (content == null) {
        LiveUpdateNotifier.cancel(context, journeyId)
      } else {
        LiveUpdateNotifier.post(context, journeyId, content.toCard(), live = false, scheduled = emptyList())
      }
    }

    // Whether the OS will grant Live Update promotion (Android 16+, per-app
    // user setting). Posting works either way — this is for diagnostics.
    Function("canPostPromoted") {
      LiveUpdateNotifier.canPostPromoted(context)
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext)
}
