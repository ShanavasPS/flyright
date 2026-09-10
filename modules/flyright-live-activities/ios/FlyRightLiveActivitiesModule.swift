import ActivityKit
import ExpoModulesCore
import OneSignalLiveActivities

/// The lock-screen truth the JS lifecycle can't see on its own — see
/// ../index.ts. Every FlyRight Live Activity is started through OneSignal's
/// `startDefault`, so they are all typed `DefaultLiveActivityAttributes` and
/// carry the id we chose in `attributes.onesignal.activityId`.
public class FlyRightLiveActivitiesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FlyRightLiveActivities")

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
        for activity in live where !keep.contains(activity.attributes.onesignal.activityId) {
          await activity.end(nil, dismissalPolicy: .immediate)
          ended += 1
        }
        if ended > 0 {
          NSLog("[FlyRightLiveActivities] ended %d orphan(s) of %d live activities", ended, live.count)
        }
        promise.resolve(ended)
      }
    }
  }
}
