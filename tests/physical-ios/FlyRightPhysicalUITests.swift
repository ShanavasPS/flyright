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

    /// Demo footage helper: full-screen frames while the invite → App Store →
    /// install → first-launch story plays out on the phone. Opens the invite
    /// link, taps App Store on the landing, Get and Open in the App Store, Skip
    /// and Allow in FlyRight; the person holding the phone only confirms the
    /// install (Face ID). Every wait keeps taking frames, so the result bundle
    /// holds the whole sequence; the editor picks which frames ship. Never
    /// fails on a missing element — the frames are the deliverable. Env
    /// (TEST_RUNNER_ prefix on the xcodebuild side): FLYRIGHT_OPEN_URL,
    /// FLYRIGHT_CAPTURE_INTERVAL (seconds, default 0.35).
    func testCaptureDemoFrames() throws {
        let env = ProcessInfo.processInfo.environment
        let interval = Double(env["FLYRIGHT_CAPTURE_INTERVAL"] ?? "") ?? 0.35
        let started = Date()
        var index = 0
        func frame() {
            let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot(), quality: .original)
            shot.name = String(format: "frame-%04d-%06.2fs", index, Date().timeIntervalSince(started))
            shot.lifetime = .keepAlways
            add(shot)
            index += 1
        }
        func frames(for seconds: Double) {
            let until = Date().addingTimeInterval(seconds)
            while Date() < until { frame(); Thread.sleep(forTimeInterval: interval) }
        }
        /// Frames until one of the candidates exists (or the timeout); returns it.
        func waitTaking(_ candidates: [XCUIElement], timeout: Double) -> XCUIElement? {
            let until = Date().addingTimeInterval(timeout)
            while Date() < until {
                frame()
                if let hit = candidates.first(where: { $0.exists }) { return hit }
                Thread.sleep(forTimeInterval: interval)
            }
            return nil
        }
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        let store = XCUIApplication(bundleIdentifier: "com.apple.AppStore")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

        if let raw = env["FLYRIGHT_OPEN_URL"], let url = URL(string: raw) {
            XCUIDevice.shared.system.open(url)
        }
        // 1. The landing: "App Store" below the fold.
        if let link = waitTaking([safari.links["App Store"], safari.buttons["App Store"], safari.staticTexts["App Store"]], timeout: 30) {
            frames(for: 2)
            if !link.isHittable { safari.swipeUp(); frames(for: 1.5) }
            link.tap()
        }
        // 2. The store page: Get (the person confirms the install).
        // The listing shows GET for a new install, or a cloud (re-download)
        // icon for an app this Apple Account had before; the icon has no
        // stable label, so it is tapped where it sits under the title.
        let get = store.buttons.matching(NSPredicate(format: "label ==[c] 'GET' OR label ==[c] 'Get' OR label ==[c] 'Download' OR label CONTAINS[c] 'download'")).firstMatch
        let title = store.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'FlyRight'")).firstMatch
        if let hit = waitTaking([get, title], timeout: 40) {
            frames(for: 2.5)
            let tree = XCTAttachment(string: store.debugDescription)
            tree.name = "store-hierarchy"
            tree.lifetime = .keepAlways
            add(tree)
            if hit == get { get.tap() } else {
                store.coordinate(withNormalizedOffset: CGVector(dx: 0.43, dy: 0.266)).tap()
            }
        }
        // 3. Installed: Open.
        let open = store.buttons.matching(NSPredicate(format: "label ==[c] 'OPEN' OR label ==[c] 'Open'")).firstMatch
        if waitTaking([open], timeout: 150) != nil {
            frames(for: 2)
            open.tap()
        }
        // 4. First launch: Skip, the tracking prompt, and the invitation.
        if let skip = waitTaking([app.buttons["Skip"], app.staticTexts["Skip"]], timeout: 45) {
            frames(for: 2)
            skip.tap()
        }
        if let allow = waitTaking([springboard.alerts.buttons["Allow"], springboard.buttons["Allow"]], timeout: 15) {
            frames(for: 1)
            allow.tap()
        }
        _ = waitTaking([app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'invited you'")).firstMatch], timeout: 30)
        frames(for: 5)
        XCTAssertGreaterThan(index, 0)
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
