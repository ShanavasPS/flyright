import AppIntents
internal import FlyRightAssistant

// Compiled into the main application target: Xcode's App Intents metadata
// extractor must see these types outside a static CocoaPod. No trip data is
// indexed. Expo Router resolves the destination after auth and SQLite load.
struct ShowNextFlyRightFlight: AppIntent {
  static var title: LocalizedStringResource = "Show my next flight"
  static var description = IntentDescription("Open your next saved flight in FlyRight.")
  static var openAppWhenRun: Bool = true
  static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  @MainActor
  func perform() async throws -> some IntentResult {
    FlyRightAssistantStore.enqueue("next-flight")
    return .result()
  }
}

struct ShowFlyRightBoardingPass: AppIntent {
  static var title: LocalizedStringResource = "Show my boarding pass"
  static var description = IntentDescription("Open the boarding pass saved for your next flight in FlyRight.")
  static var openAppWhenRun: Bool = true
  static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  @MainActor
  func perform() async throws -> some IntentResult {
    FlyRightAssistantStore.enqueue("boarding-pass")
    return .result()
  }
}

struct AddFlyRightFlight: AppIntent {
  static var title: LocalizedStringResource = "Add a flight"
  static var description = IntentDescription("Open FlyRight to look up, scan, or add a flight. You review and save it in the app.")
  static var openAppWhenRun: Bool = true
  static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  @MainActor
  func perform() async throws -> some IntentResult {
    FlyRightAssistantStore.enqueue("add-flight")
    return .result()
  }
}

struct FlyRightShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: ShowNextFlyRightFlight(),
      phrases: ["Show my next flight in \(.applicationName)", "Open my next flight in \(.applicationName)"],
      shortTitle: "Next flight",
      systemImageName: "airplane"
    )
    AppShortcut(
      intent: ShowFlyRightBoardingPass(),
      phrases: ["Show my boarding pass in \(.applicationName)", "Open my boarding pass in \(.applicationName)"],
      shortTitle: "Boarding pass",
      systemImageName: "qrcode"
    )
    AppShortcut(
      intent: AddFlyRightFlight(),
      phrases: ["Add a flight in \(.applicationName)", "Add a flight to \(.applicationName)"],
      shortTitle: "Add a flight",
      systemImageName: "plus.circle"
    )
  }
}
