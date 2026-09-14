import XCTest

/// Exercises the installed store/TestFlight app without rebuilding or clearing it.
/// Run only on the explicitly selected physical iPhone. No account/data seeding.
final class FlyRightPhysicalUITests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "com.shanavasshaji.flyright")

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDownWithError() throws {
        capture("final-state")
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
    }

    private func waitForContent(_ pattern: String, file: StaticString = #filePath, line: UInt = #line) {
        // Content labels, not tab labels, establish that the destination loaded.
        let element = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label MATCHES %@", pattern)).firstMatch
        XCTAssertTrue(element.waitForExistence(timeout: 30), "Missing screen content: \(pattern)", file: file, line: line)
    }

    private func assertHealthy(file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(app.state, .runningForeground, "FlyRight left the foreground", file: file, line: line)
        let error = app.staticTexts.matching(NSPredicate(
            format: "label CONTAINS[c] 'Something went wrong' OR label CONTAINS[c] 'Could not find public function' OR label CONTAINS[c] \"Couldn't read your\" OR label CONTAINS[c] 'Uncaught Error'"
        )).firstMatch
        XCTAssertFalse(error.exists, "An error appeared: \(error.exists ? error.label : "")", file: file, line: line)
    }

    private func tapTab(_ title: String) {
        let button = app.tabBars.buttons[title]
        XCTAssertTrue(button.waitForExistence(timeout: 15), "Missing tab: \(title)")
        XCTAssertTrue(button.isHittable, "Tab is not tappable: \(title)")
        button.tap()
        XCTAssertTrue(button.isSelected, "Tab did not become selected: \(title)")
    }

    func testAllTabsAcrossTwoColdStarts() throws {
        for pass in 1...2 {
            app.terminate()
            app.launch()
            XCTAssertTrue(app.tabBars.buttons["My travels"].waitForExistence(timeout: 60))
            // Include a startup observation window for delayed backend failures.
            Thread.sleep(forTimeInterval: 30)
            assertHealthy()

            tapTab("My travels")
            waitForContent("Add a flight, past or future")
            assertHealthy()
            capture("pass-\(pass)-travels")

            tapTab("World")
            waitForContent("Showing .*|Your world map awaits")
            Thread.sleep(forTimeInterval: 3)
            assertHealthy()
            capture("pass-\(pass)-world")

            tapTab("People")
            waitForContent("Sign in to invite|Nobody's following you yet|Following.*|Followers.*")
            assertHealthy()
            capture("pass-\(pass)-people")

            tapTab("Claims")
            waitForContent("No claims yet|In progress|Closed")
            assertHealthy()
            capture("pass-\(pass)-claims")

            tapTab("Settings")
            waitForContent("Appearance")
            assertHealthy()
            capture("pass-\(pass)-settings")
            let signedOut = app.staticTexts.matching(NSPredicate(
                format: "label == 'Sign in or create account' OR label == 'Sign back in'"
            )).firstMatch.exists
            let state = XCTAttachment(string: signedOut ? "signed-out" : "signed-in-or-unverified; inspect Settings screenshot")
            state.name = "pass-\(pass)-account-state"
            state.lifetime = .keepAlways
            add(state)

            tapTab("My travels")
            waitForContent("Add a flight, past or future")
            assertHealthy()
        }
    }
}
