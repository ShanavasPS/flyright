import AppIntents
internal import FlyRightLiveActivities

// The traveller's "I'm through security" on the Lock Screen and in the
// Dynamic Island. A LiveActivityIntent declared in both the app and the
// widget extension (targets/FlyRightWidget/FlyRightLiveActivity.swift, same
// name and parameters) runs here, in the app's process, without opening the
// app: only the app can update its own Live Activity, which is how the card
// answers the tap at once. The mark itself waits in FlyRightStepMarks until
// the JS lifecycle records it (src/services/step-marks.ts).
@available(iOS 17.0, *)
struct MarkTravelStep: LiveActivityIntent {
  static var title: LocalizedStringResource = "Mark a travel step"
  static var isDiscoverable: Bool = false

  @Parameter(title: "Trip")
  var journeyId: String

  @Parameter(title: "Step")
  var stage: String

  init() {}

  init(journeyId: String, stage: String) {
    self.journeyId = journeyId
    self.stage = stage
  }

  func perform() async throws -> some IntentResult {
    await FlyRightStepMarks.mark(journeyId: journeyId, stage: stage)
    return .result()
  }
}
