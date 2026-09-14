import ExpoModulesCore
import Foundation

/// App Intents can run before React Native starts listening. Keep the most
/// recent navigation request on disk until the root navigator and auth are ready.
/// Contains no account, trip, or barcode data. Requests expire after five minutes.
public enum FlyRightAssistantStore {
  private static let lock = NSLock()
  private static let key = "flyright.assistant.pending"
  static let changed = Notification.Name("FlyRightAssistantAction")

  public static func enqueue(_ action: String) {
    guard ["next-flight", "boarding-pass", "add-flight"].contains(action) else { return }
    lock.lock()
    UserDefaults.standard.set(["action": action, "time": Date().timeIntervalSince1970], forKey: key)
    lock.unlock()
    NotificationCenter.default.post(name: changed, object: nil)
  }

  static func take() -> String? {
    lock.lock()
    defer { lock.unlock() }
    guard let request = UserDefaults.standard.dictionary(forKey: key) else { return nil }
    UserDefaults.standard.removeObject(forKey: key)
    guard let action = request["action"] as? String, let time = request["time"] as? Double,
          (0...300).contains(Date().timeIntervalSince1970 - time) else { return nil }
    return action
  }
}

public class FlyRightAssistantModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("FlyRightAssistant")
    Events("onAction")
    Function("takePendingAction") { FlyRightAssistantStore.take() }
    OnCreate { [weak self] in
      self?.observer = NotificationCenter.default.addObserver(
        forName: FlyRightAssistantStore.changed, object: nil, queue: .main
      ) { [weak self] _ in self?.sendEvent("onAction") }
    }
    OnDestroy { [weak self] in
      if let observer = self?.observer { NotificationCenter.default.removeObserver(observer) }
      self?.observer = nil
    }
  }
}
