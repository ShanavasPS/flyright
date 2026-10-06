import CoreHaptics
import ExpoModulesCore

/// The travel day's moments as authored Core Haptics patterns — the things
/// UIFeedbackGenerator's presets cannot say: a swell that cuts out as the
/// wheels leave, main gear then nose gear on touchdown. The JS contract
/// lives in modules/flyright-haptics/index.ts (moment names must match).
///
/// `play` resolves false when the hardware has no Taptic Engine or the
/// engine will not start; the caller then falls back to a preset.
public final class FlyRightHapticsModule: Module {
  private var engine: CHHapticEngine?
  /// Owns `engine`, which the engine's own handlers also reset. Not the main
  /// queue: nothing here touches UIKit.
  private let queue = DispatchQueue(label: "com.shanavasshaji.flyright.haptics")
  private static let supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics

  public func definition() -> ModuleDefinition {
    Name("FlyRightHaptics")

    AsyncFunction("play") { (moment: String) -> Bool in
      guard let events = Self.pattern(for: moment) else { return false }
      return self.queue.sync { self.play(events) }
    }

    OnDestroy {
      self.queue.sync {
        self.engine?.stop()
        self.engine = nil
      }
    }
  }

  private func play(_ events: [CHHapticEvent]) -> Bool {
    guard Self.supportsHaptics else { return false }
    do {
      let engine = try startedEngine()
      let pattern = try CHHapticPattern(events: events, parameters: [])
      try engine.makePlayer(with: pattern).start(atTime: CHHapticTimeImmediate)
      return true
    } catch {
      // A stale engine (audio session reset, app returning from background)
      // is rebuilt on the next moment rather than retried now.
      engine = nil
      return false
    }
  }

  private func startedEngine() throws -> CHHapticEngine {
    if let engine { return engine }
    let engine = try CHHapticEngine()
    engine.playsHapticsOnly = true
    // Moments are seconds apart at most; let the engine sleep between them.
    engine.isAutoShutdownEnabled = true
    // The handlers arrive on the engine's own queue; `engine` belongs to ours.
    engine.resetHandler = { [weak self] in self?.queue.async { self?.engine = nil } }
    engine.stoppedHandler = { [weak self] _ in self?.queue.async { self?.engine = nil } }
    try engine.start()
    self.engine = engine
    return engine
  }

  private static func tap(_ time: TimeInterval, intensity: Float, sharpness: Float) -> CHHapticEvent {
    CHHapticEvent(
      eventType: .hapticTransient,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
      ],
      relativeTime: time)
  }

  private static func hum(
    _ time: TimeInterval, duration: TimeInterval, intensity: Float, sharpness: Float
  ) -> CHHapticEvent {
    CHHapticEvent(
      eventType: .hapticContinuous,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
      ],
      relativeTime: time,
      duration: duration)
  }

  /// A continuous event can't change its own intensity without a parameter
  /// curve, so ramps are stepped hums — short enough to read as one sweep.
  private static func ramp(
    from start: TimeInterval, duration: TimeInterval, steps: Int,
    intensity: (Float, Float), sharpness: (Float, Float)
  ) -> [CHHapticEvent] {
    let slice = duration / Double(steps)
    return (0..<steps).map { i in
      let t = Float(i) / Float(max(steps - 1, 1))
      return hum(
        start + slice * Double(i), duration: slice,
        intensity: intensity.0 + (intensity.1 - intensity.0) * t,
        sharpness: sharpness.0 + (sharpness.1 - sharpness.0) * t)
    }
  }

  static func pattern(for moment: String) -> [CHHapticEvent]? {
    switch moment {
    case "boarding":
      // The gate reader: two crisp beeps.
      return [
        tap(0, intensity: 0.75, sharpness: 0.7),
        tap(0.12, intensity: 0.75, sharpness: 0.7),
      ]
    case "takeOff":
      // The take-off roll builds, and stops dead as the wheels leave; the
      // gear tucks away a beat later.
      return ramp(from: 0, duration: 1.8, steps: 18, intensity: (0.15, 0.85), sharpness: (0.05, 0.4))
        + [tap(2.0, intensity: 0.45, sharpness: 0.8)]
    case "landed":
      // Touchdown as felt from the cabin: both main gears hit a beat apart,
      // the roll-out rumbles over runway joints, the nose gear drops, then
      // reverse thrust roars and dies away while the joints slow down.
      let joints: [TimeInterval] = [0.22, 0.42, 0.62, 1.2, 1.45, 1.75, 2.1, 2.5]
      return [
        tap(0, intensity: 1, sharpness: 0.15),
        tap(0.06, intensity: 0.7, sharpness: 0.2),
        hum(0.06, duration: 0.74, intensity: 0.35, sharpness: 0.05),
        tap(0.8, intensity: 0.85, sharpness: 0.2),
      ]
        + ramp(from: 0.9, duration: 0.45, steps: 5, intensity: (0.3, 0.75), sharpness: (0.1, 0.15))
        + ramp(from: 1.35, duration: 1.3, steps: 10, intensity: (0.75, 0.05), sharpness: (0.15, 0))
        + joints.map { tap($0, intensity: 0.35, sharpness: 0.4) }
    case "owed":
      // Coins: three rising taps and a short shimmer.
      return [
        tap(0, intensity: 0.45, sharpness: 0.35),
        tap(0.09, intensity: 0.65, sharpness: 0.55),
        tap(0.18, intensity: 0.9, sharpness: 0.8),
        hum(0.24, duration: 0.22, intensity: 0.3, sharpness: 0.9),
      ]
    default:
      return nil
    }
  }
}
