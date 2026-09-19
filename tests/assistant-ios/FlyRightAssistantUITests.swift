import XCTest

/// Uses the existing journal without seeding or removing trips. For a physical
/// phone, supply FLYRIGHT_ASSISTANT_EXPECTED_FLIGHT in the test runner environment.
final class FlyRightAssistantUITests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "com.shanavasshaji.flyright")
    private let flightNumber = ProcessInfo.processInfo.environment["FLYRIGHT_ASSISTANT_EXPECTED_FLIGHT"]
    private var hasSavedPass = false

    override func setUpWithError() throws { continueAfterFailure = false }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    private func capture(_ name: String) {
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = "\(name)-hierarchy"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
        for bundle in ["com.apple.shortcuts", "com.apple.springboard", "com.apple.Siri"] {
            let systemApp = XCUIApplication(bundleIdentifier: bundle)
            if systemApp.state == .runningForeground {
                let systemHierarchy = XCTAttachment(string: systemApp.debugDescription)
                systemHierarchy.name = "\(name)-\(bundle)-hierarchy"
                systemHierarchy.lifetime = .keepAlways
                add(systemHierarchy)
            }
        }
    }

    override func tearDownWithError() throws { capture("final-state") }

    private func prepareJournal() {
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Flights"].waitForExistence(timeout: 60))
        guard let flightNumber else { return }
        let trip = app.links.matching(NSPredicate(format: "label CONTAINS %@", flightNumber)).firstMatch
        XCTAssertTrue(trip.waitForExistence(timeout: 30), "Expected saved flight is missing before testing")
        trip.tap()
        let passState = NSPredicate { _, _ in
            self.element("boarding-pass-card").exists || self.element("boarding-pass-add").exists
        }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: passState, object: nil)], timeout: 30), .completed)
        hasSavedPass = element("boarding-pass-card").exists
        capture("existing-flight-\(hasSavedPass ? "with-pass" : "without-pass")")
        returnHome()
    }

    private func assertScreen(_ action: String) {
        if action == "add-flight" {
            XCTAssertTrue(app.staticTexts["Add Flight"].waitForExistence(timeout: 60))
        } else if let flightNumber {
            if action == "boarding-pass" && !hasSavedPass {
                XCTAssertTrue(app.staticTexts["No boarding pass saved for your next flight"].waitForExistence(timeout: 60))
            } else {
                let flight = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", flightNumber)).firstMatch
                XCTAssertTrue(flight.waitForExistence(timeout: 60), "Assistant opened the wrong saved flight")
                let marker = action == "boarding-pass" ? "Boarding pass options" : (hasSavedPass ? "boarding-pass-card" : "boarding-pass-add")
                XCTAssertTrue(element(marker).waitForExistence(timeout: 30))
            }
        } else {
            XCTAssertTrue(app.staticTexts["No upcoming flight saved"].waitForExistence(timeout: 60))
        }
        XCTAssertEqual(app.state, .runningForeground)
    }

    private func returnHome() {
        if element("Close").exists { element("Close").tap() }
        else if app.buttons["Flights"].firstMatch.exists { app.buttons["Flights"].firstMatch.tap() }
        else if app.navigationBars.buttons["Back"].firstMatch.exists { app.navigationBars.buttons["Back"].firstMatch.tap() }
        if !app.buttons["Add a flight, past or future"].exists && app.navigationBars.buttons["Back"].firstMatch.exists {
            app.navigationBars.buttons["Back"].firstMatch.tap()
        }
        XCTAssertTrue(app.buttons["Add a flight, past or future"].waitForExistence(timeout: 20))
    }

    private func invoke(_ phrase: String, action: String, cold: Bool) {
        if cold { app.terminate() }
        XCUIDevice.shared.siriService.activate(voiceRecognitionText: phrase)
        Thread.sleep(forTimeInterval: 4)
        capture("siri-response-\(cold ? "cold" : "warm")-\(action)")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let turnOn = springboard.buttons["Turn On"].firstMatch
        if turnOn.exists && turnOn.isHittable {
            turnOn.tap()
            capture("siri-flyright-enabled")
        }
        assertScreen(action)
        capture("siri-\(cold ? "cold" : "warm")-\(action)")
    }

    func testSiriActionsAcrossColdAndWarmStarts() {
        // Start once so iOS registers the shortcut phrases. Complete the
        // existing onboarding before running; this suite never changes data.
        prepareJournal()
        for cold in [true, false] {
            invoke("Show my next flight in FlyRight", action: "next-flight", cold: cold)
            returnHome()
            invoke("Show my boarding pass in FlyRight", action: "boarding-pass", cold: cold)
            returnHome()
            invoke("Add a flight in FlyRight", action: "add-flight", cold: cold)
            returnHome()
        }
    }

    func testAppShortcutsAcrossColdAndWarmStarts() {
        let shortcuts = XCUIApplication(bundleIdentifier: "com.apple.shortcuts")
        prepareJournal()
        for cold in [true, false] {
            for (label, action) in [("Next flight", "next-flight"),
                                   ("Boarding pass", "boarding-pass"),
                                   ("Add a flight", "add-flight")] {
                if cold { app.terminate() }
                shortcuts.activate()
                let shortcut = shortcuts.descendants(matching: .any).matching(identifier: label).firstMatch
                if !shortcut.waitForExistence(timeout: 3) {
                    // App Shortcuts live in Library, outside the user's All
                    // Shortcuts search. Avoid typing into the user's keyboard.
                    let close = shortcuts.navigationBars.buttons["Close"].firstMatch
                    if close.exists && close.isHittable { close.tap() }
                    let library = shortcuts.navigationBars.buttons["Library"].firstMatch
                    if library.exists && library.isHittable { library.tap() }
                    let group = shortcuts.buttons.matching(NSPredicate(format: "label == %@", "FlyRight")).firstMatch
                    capture("shortcuts-library")
                    for _ in 0..<8 {
                        if group.exists && group.isHittable { break }
                        shortcuts.swipeUp()
                    }
                    capture("shortcuts-app-catalog")
                    if group.exists && group.isHittable { group.tap() }
                }
                XCTAssertTrue(shortcut.waitForExistence(timeout: 30), "Missing App Shortcut: \(label)")
                if cold && action == "next-flight" {
                    let info = shortcuts.navigationBars["FlyRight"].buttons.matching(
                        NSPredicate(format: "identifier != %@ AND label != %@", "BackButton", "Library")
                    ).firstMatch
                    if info.exists && info.isHittable {
                        info.tap()
                        capture("flyright-siri-setting-before")
                        let siri = shortcuts.switches.matching(NSPredicate(format: "label CONTAINS[c] %@", "Siri")).firstMatch
                        if siri.exists && siri.value as? String == "0" {
                            // iOS 26 exposes both the row and its nested switch.
                            // Tapping the row's center does not change the value.
                            let control = siri.switches.firstMatch
                            if control.exists { control.tap() } else { siri.tap() }
                            let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "1"), object: siri)
                            XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 5), .completed)
                        }
                        capture("flyright-siri-setting-after")
                        let done = shortcuts.buttons["Done"].firstMatch
                        let close = shortcuts.buttons["Close"].firstMatch
                        if done.exists { done.tap() }
                        else if close.exists { close.tap() }
                        else { shortcuts.swipeDown() }
                    }
                }
                capture("shortcuts-ready-\(action)")
                shortcut.tap()
                assertScreen(action)
                capture("shortcuts-\(cold ? "cold" : "warm")-\(action)")
                returnHome()
            }
        }
    }

    // MARK: - Globe demo capture (scripts/globe-demo)

    /// Drives the World tab globe like a person would, for the LinkedIn demo
    /// recorded with `simctl io recordVideo`: My travels → the upcoming trip
    /// → its inset → World focused on that route → zoom out, spin, zoom in →
    /// All travels → play → light mode → play. Real pinches and flicks, which
    /// Maestro cannot synthesize; short pauses so the screen never sits still.
    /// Needs the seeded demo journal (scripts/seed-demo-data.mjs) and a dark
    /// simulator to start from. Changes no data.
    func testCaptureGlobeDemo() throws {
        let pause = { (s: Double) in Thread.sleep(forTimeInterval: s) }
        func point(_ e: XCUIElement, _ x: Double, _ y: Double) -> XCUICoordinate {
            e.coordinate(withNormalizedOffset: CGVector(dx: x, dy: y))
        }
        func drag(_ e: XCUIElement, from a: (Double, Double), to b: (Double, Double), velocity: Double) {
            point(e, a.0, a.1).press(forDuration: 0.03, thenDragTo: point(e, b.0, b.1),
                                     withVelocity: XCUIGestureVelocity(rawValue: velocity), thenHoldForDuration: 0)
        }
        XCUIDevice.shared.appearance = .dark
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Flights"].waitForExistence(timeout: 60))
        pause(1.0)
        let hero = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "AY1331")).firstMatch
        XCTAssertTrue(hero.waitForExistence(timeout: 10))
        hero.tap()
        let inset = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Open in World")).firstMatch
        XCTAssertTrue(inset.waitForExistence(timeout: 15))
        pause(1.0)
        inset.tap()
        // The globe's identifier is only reliable for the wait; gestures go by
        // screen position (the globe fills the middle of the World tab).
        XCTAssertTrue(element("world-globe").waitForExistence(timeout: 15))
        let screen = app
        pause(1.3)
        // Focused on one route: zoom out to the planet, spin, tilt, back in.
        screen.pinch(withScale: 0.3, velocity: -1.6)
        pause(0.5)
        screen.pinch(withScale: 0.4, velocity: -1.4)
        pause(0.4)
        drag(screen, from: (0.8, 0.48), to: (0.2, 0.48), velocity: 1800)
        pause(1.4)
        drag(screen, from: (0.5, 0.35), to: (0.5, 0.6), velocity: 700)
        pause(0.6)
        screen.pinch(withScale: 2.4, velocity: 2.0)
        pause(0.5)
        drag(screen, from: (0.38, 0.58), to: (0.6, 0.42), velocity: 600)
        pause(0.6)
        // Every trip.
        let all = app.buttons["Show all travels"].firstMatch
        XCTAssertTrue(all.waitForExistence(timeout: 5))
        all.tap()
        pause(1.5)
        drag(screen, from: (0.2, 0.48), to: (0.8, 0.48), velocity: 2000)
        pause(1.6)
        point(screen, 0.5, 0.5).doubleTap()
        pause(0.8)
        drag(screen, from: (0.6, 0.55), to: (0.42, 0.42), velocity: 650)
        pause(0.6)
        screen.pinch(withScale: 0.4, velocity: -1.5)
        pause(0.5)
        let recenter = app.buttons["Recenter the globe on your travels"].firstMatch
        if recenter.waitForExistence(timeout: 3) { recenter.tap() }
        pause(1.4)
        // Light mode, live.
        XCUIDevice.shared.appearance = .light
        pause(0.9)
        drag(screen, from: (0.78, 0.45), to: (0.22, 0.52), velocity: 1600)
        pause(1.4)
        point(screen, 0.5, 0.5).doubleTap()
        pause(0.8)
        drag(screen, from: (0.42, 0.5), to: (0.56, 0.45), velocity: 500)
        pause(0.6)
        if recenter.waitForExistence(timeout: 3) { recenter.tap() }
        pause(1.8)
    }
}
