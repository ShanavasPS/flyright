import ActivityKit
import ExpoModulesCore
import OneSignalLiveActivities

/// Steps the traveller marked from the Lock Screen or the Dynamic Island
/// (MarkTravelStep, plugins/assistant/FlyRightStepIntent.swift). The intent
/// runs in the app's process, often with React Native not yet listening, so
/// the marks wait on disk until the JS lifecycle takes them
/// (services/step-marks) and records them like a tap in the app.
public enum FlyRightStepMarks {
  private static let lock = NSLock()
  private static let key = "flyright.stepMarks.pending"
  static let changed = Notification.Name("FlyRightStepMarked")

  public static func mark(journeyId: String, stage: String) async {
    lock.lock()
    var marks = UserDefaults.standard.array(forKey: key) as? [[String: Any]] ?? []
    marks.append(["journeyId": journeyId, "stage": stage, "at": Date().timeIntervalSince1970])
    UserDefaults.standard.set(Array(marks.suffix(20)), forKey: key)
    lock.unlock()
    // The card answers the tap at once: its button goes, so a second tap
    // can't land on whatever step it would show next. The JS lifecycle then
    // posts the real next card, with the next step's button.
    for activity in Activity<DefaultLiveActivityAttributes>.activities
    where activity.attributes.data["journeyId"]?.asString() == journeyId
      && !activity.attributes.onesignal.activityId.hasPrefix("following~") {
      var next = activity.content.state
      var data = next.data
      data["actionStage"] = AnyCodable("")
      data["actionLabel"] = AnyCodable("")
      next.data = data
      await activity.update(ActivityContent(state: next, staleDate: activity.content.staleDate))
    }
    await MainActor.run { NotificationCenter.default.post(name: changed, object: nil) }
  }

  /// The marks still waiting, oldest first, and forgets them. A mark older
  /// than half a day is dropped: the travel day it belonged to is over.
  static func take() -> [[String: Any]] {
    lock.lock()
    defer { lock.unlock() }
    let marks = UserDefaults.standard.array(forKey: key) as? [[String: Any]] ?? []
    UserDefaults.standard.removeObject(forKey: key)
    let now = Date().timeIntervalSince1970
    return marks.filter { (($0["at"] as? Double).map { now - $0 < 12 * 3600 }) ?? false }
  }
}

/// The lock-screen truth the JS lifecycle can't see on its own — see
/// ../index.ts. Every FlyRight Live Activity is started through OneSignal's
/// `startDefault`, so they are all typed `DefaultLiveActivityAttributes` and
/// carry the id we chose in `attributes.onesignal.activityId`.
public class FlyRightLiveActivitiesModule: Module {
  private var stepObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("FlyRightLiveActivities")

    // Steps marked on the Lock Screen or in the Dynamic Island (above).
    Events("onStepMarked")
    Function("takePendingStepMarks") { FlyRightStepMarks.take() }
    OnCreate { [weak self] in
      self?.stepObserver = NotificationCenter.default.addObserver(
        forName: FlyRightStepMarks.changed, object: nil, queue: .main
      ) { [weak self] _ in self?.sendEvent("onStepMarked") }
    }
    OnDestroy { [weak self] in
      if let observer = self?.stepObserver { NotificationCenter.default.removeObserver(observer) }
      self?.stepObserver = nil
    }

    // Only activities still alive: `activities` also lists ones the OS has
    // ended but still shows dimmed on the lock screen (the eight-hour cap
    // does that to every long travel day), and those can't be updated —
    // the lifecycle must forget them and start afresh. `.stale` is alive
    // with a passed staleDate.
    AsyncFunction("listActivityIds") { () -> [String] in
      return Activity<DefaultLiveActivityAttributes>.activities
        .filter { $0.activityState == .active || $0.activityState == .stale }
        .map { $0.attributes.onesignal.activityId }
    }

    // End every activity whose id is not in `keep` — orphans from journeys
    // that left the journal without a teardown, starts whose id was lost, or
    // activities the OS carried across an update. Immediate dismissal: an
    // orphan has no final state worth lingering for.
    AsyncFunction("endActivities") { (keep: [String], promise: Promise) in
      Task {
        let live = Activity<DefaultLiveActivityAttributes>.activities
        var ended = 0
        for activity in live where !activity.attributes.onesignal.activityId.hasPrefix("following~") && !keep.contains(activity.attributes.onesignal.activityId) {
          await activity.end(nil, dismissalPolicy: .immediate)
          ended += 1
        }
        if ended > 0 {
          NSLog("[FlyRightLiveActivities] ended %d orphan(s) of %d live activities", ended, live.count)
        }
        promise.resolve(ended)
      }
    }

    // Move an activity's stale date without touching its content.
    //
    // The widget's clock is an archived view: it is built once, in the app's
    // process, and then only ticks, so the branch it chose (see ClockText)
    // stops being right when the countdown crosses ten hours or runs out,
    // and nothing in the view can notice. A stale date does NOT bring it
    // back — that was measured, with the date provably set and held, and the
    // card stayed mangled. Only new content replaces it, which is what the
    // server's refresh push is for. This just lets iOS dim a card whose
    // refresh never landed, so it reads as old rather than as current.
    //
    // Set, then read back and set again: `startDefault` is still settling
    // its push tokens when this runs, and the update it makes a moment later
    // carries no stale date and wipes ours. The content state is carried
    // over unchanged every time — this moves the deadline, never the facts.
    AsyncFunction("setStaleDate") { (activityId: String, atSeconds: Double, promise: Promise) in
      Task {
        let at = Date(timeIntervalSince1970: atSeconds)
        func find() -> Activity<DefaultLiveActivityAttributes>? {
          Activity<DefaultLiveActivityAttributes>.activities
            .first(where: { $0.attributes.onesignal.activityId == activityId })
        }
        // `startDefault` returns before ActivityKit lists the activity.
        var activity: Activity<DefaultLiveActivityAttributes>?
        for _ in 0..<24 {
          activity = find()
          if activity != nil { break }
          try? await Task.sleep(nanoseconds: 250_000_000)
        }
        guard activity != nil else {
          NSLog("[FlyRightLiveActivities] no activity %@ to stale-date", activityId)
          promise.resolve(false)
          return
        }
        // Six passes over three seconds: long enough to outlast the start's
        // own updates, and a no-op once the date has stuck.
        var stuck = false
        for pass in 0..<6 {
          guard let current = find() else { break }
          let held = current.content.staleDate
          if let held, abs(held.timeIntervalSince(at)) < 1 {
            stuck = true
            if pass > 0 { break }
          } else {
            await current.update(ActivityContent(state: current.content.state, staleDate: at))
          }
          try? await Task.sleep(nanoseconds: 500_000_000)
        }
        stuck = find()?.content.staleDate.map { abs($0.timeIntervalSince(at)) < 1 } ?? false
        NSLog("[FlyRightLiveActivities] stale date %@ for %@: %@",
              ISO8601DateFormatter().string(from: at), activityId, stuck ? "set" : "REFUSED")
        promise.resolve(stuck)
      }
    }

    // Rewrite an activity's content from the device, with no network.
    //
    // The normal path for a change is our /api/live-activity proxy, which is
    // a fetch — useless on a plane, which is exactly where the widget's
    // clock runs out and the archived view starts drawing a mangled
    // countdown. ActivityKit itself needs nothing but the process, so any
    // moment the app is alive it can repair its own card, online or not.
    //
    // `state` is the same LiveContent dict the proxy sends (contentState in
    // src/services/live-activity.ts) — keep them in step.
    AsyncFunction("updateActivityContent") { (activityId: String, state: [String: Any], promise: Promise) in
      Task {
        guard let activity = Activity<DefaultLiveActivityAttributes>.activities
          .first(where: { $0.attributes.onesignal.activityId == activityId }) else {
          promise.resolve(false)
          return
        }
        // ContentState has no memberwise init of its own, so start from the
        // one the activity is holding and replace its payload — which also
        // keeps whatever OneSignal put alongside it.
        var next = activity.content.state
        var data: [String: AnyCodable] = [:]
        for (key, value) in state { data[key] = AnyCodable(plainValue(value)) }
        next.data = data
        await activity.update(ActivityContent(state: next, staleDate: activity.content.staleDate))
        promise.resolve(true)
      }
    }

    // What iOS currently holds as the activity's stale date, in seconds since
    // the epoch — or 0 when it has none. Only the checks read this.
    AsyncFunction("staleDateOf") { (activityId: String) -> Double in
      let activity = Activity<DefaultLiveActivityAttributes>.activities
        .first(where: { $0.attributes.onesignal.activityId == activityId })
      return activity?.content.staleDate?.timeIntervalSince1970 ?? 0
    }

    // Followers have a separate authenticated lifecycle; the local journal
    // never owns their cards. Called after auth and the follower query settle.
    AsyncFunction("endFollowerActivities") { (keep: [String], promise: Promise) in
      Task {
        var ended = 0
        for activity in Activity<DefaultLiveActivityAttributes>.activities {
          let id = activity.attributes.onesignal.activityId
          if id.hasPrefix("following~") && !keep.contains(id) {
            await activity.end(nil, dismissalPolicy: .immediate)
            ended += 1
          }
        }
        promise.resolve(ended)
      }
    }
  }
}

/// JS numbers arrive as NSNumber, and AnyCodable tries `as Bool` first when
/// it encodes: an NSNumber of exactly 0 or 1 passes that, so a landed card's
/// progress of 1 was stored as `true` and the widget, reading a number, drew
/// the plane back at the origin. Unwrap numbers to Int or Double; only a real
/// JS boolean stays a Bool.
private func plainValue(_ value: Any) -> Any {
  guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return value }
  return CFNumberIsFloatType(number) ? number.doubleValue : number.intValue
}
