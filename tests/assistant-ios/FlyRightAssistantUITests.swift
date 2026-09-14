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
        XCTAssertTrue(app.tabBars.buttons["My travels"].waitForExistence(timeout: 60))
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
        else if app.buttons["My travels"].firstMatch.exists { app.buttons["My travels"].firstMatch.tap() }
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
}
