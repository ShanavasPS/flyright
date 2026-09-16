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

    /// Demo footage helper: the share moment. In the installed app: People →
    /// Invite someone → Send → the system share sheet → Messages → the compose
    /// sheet with the invite text. Frames every FLYRIGHT_CAPTURE_INTERVAL
    /// seconds throughout; the draft is discarded at the end so nothing is
    /// sent and nothing lingers. Frames start once the "Add someone" sheet is
    /// up, so the People list itself is never captured.
    func testCaptureShareFrames() throws {
        let env = ProcessInfo.processInfo.environment
        let interval = Double(env["FLYRIGHT_CAPTURE_INTERVAL"] ?? "") ?? 0.3
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
        func waitTaking(_ candidates: [XCUIElement], timeout: Double) -> XCUIElement? {
            let until = Date().addingTimeInterval(timeout)
            while Date() < until {
                frame()
                if let hit = candidates.first(where: { $0.exists }) { return hit }
                Thread.sleep(forTimeInterval: interval)
            }
            return nil
        }
        app.launch()
        // Optional prelude: sign the phone's current account out and a Clerk
        // test account in (OTP 424242), so the footage belongs to the demo
        // persona. No frames are taken while the real account is on screen.
        if let email = env["FLYRIGHT_SWITCH_EMAIL"], !email.isEmpty {
            let settings = app.tabBars.buttons["Settings"]
            XCTAssertTrue(settings.waitForExistence(timeout: 30))
            settings.tap()
            let accountRow = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS '@'")).firstMatch
            if accountRow.waitForExistence(timeout: 10) {
                accountRow.tap()
                let signOut = app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Sign out'")).firstMatch
                XCTAssertTrue(signOut.waitForExistence(timeout: 15), "No Sign out on the account screen")
                signOut.tap()
                let confirm = app.alerts.buttons["Sign out"]
                if confirm.waitForExistence(timeout: 4) { confirm.tap() }
                let sheetConfirm = app.buttons.matching(NSPredicate(format: "label == 'Sign out'")).element(boundBy: 1)
                if sheetConfirm.waitForExistence(timeout: 2) { sheetConfirm.tap() }
                let back = app.navigationBars.buttons.firstMatch
                if !app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Sign in or create account'")).firstMatch.waitForExistence(timeout: 10), back.exists { back.tap() }
            }
            let signIn = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Sign in or create account'")).firstMatch
            XCTAssertTrue(signIn.waitForExistence(timeout: 20), "No sign-in entry in Settings after sign-out")
            signIn.tap()
            // Clerk's native sheet: the field is not always an XCUI text field.
            let byType = app.textFields.matching(NSPredicate(format: "placeholderValue CONTAINS[c] 'email' OR label CONTAINS[c] 'email' OR value CONTAINS[c] 'email'")).firstMatch
            let byLabel = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] 'Enter your email' OR placeholderValue CONTAINS[c] 'Enter your email' OR value CONTAINS[c] 'Enter your email'")).firstMatch
            let welcome = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Sign in to continue'")).firstMatch
            XCTAssertTrue(byType.waitForExistence(timeout: 8) || byLabel.waitForExistence(timeout: 8) || welcome.waitForExistence(timeout: 8), "No sign-in sheet")
            if byType.exists { byType.tap() } else if byLabel.exists { byLabel.tap() } else {
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.424)).tap()
            }
            Thread.sleep(forTimeInterval: 1)
            let softKeyboard = app.keyboards.firstMatch
            XCTAssertTrue(softKeyboard.waitForExistence(timeout: 8), "Keyboard did not appear for the email field")
            app.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 60))
            app.typeText(email)
            let cont = app.buttons["Continue"]
            XCTAssertTrue(cont.waitForExistence(timeout: 10))
            cont.tap()
            let check = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Check your email'")).firstMatch
            XCTAssertTrue(check.waitForExistence(timeout: 20), "No OTP step")
            Thread.sleep(forTimeInterval: 1)
            app.typeText("424242")
            let notNow = app.buttons["Not now"]
            _ = notNow.waitForExistence(timeout: 25)
            if notNow.exists { notNow.tap() }
            Thread.sleep(forTimeInterval: 2)
        }
        let people = app.tabBars.buttons["People"]
        XCTAssertTrue(people.waitForExistence(timeout: 30))
        people.tap()
        let invite = app.buttons["Invite someone to follow your trips"]
        XCTAssertTrue(invite.waitForExistence(timeout: 30), "No invite button — is this account's People tab empty?")
        invite.tap()
        let send = app.buttons["share-invite-link"]
        XCTAssertTrue(send.waitForExistence(timeout: 15))
        frames(for: 2)
        send.tap()
        // The share sheet is SpringBoard's; Messages is its cell.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let messagesCell = springboard.cells["Messages"]
        let messagesButton = springboard.buttons["Messages"]
        let messagesAny = springboard.descendants(matching: .any).matching(NSPredicate(format: "label == 'Messages'")).firstMatch
        if let hit = waitTaking([messagesCell, messagesButton, messagesAny], timeout: 12) {
            frames(for: 2.5)
            hit.tap()
        } else {
            // iOS 26's share sheet does not expose its app row; Messages sits
            // second in that row (measured on the iPhone 15 Pro, 2026-09-16).
            frames(for: 1)
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.39, dy: 0.74)).tap()
        }
        // The compose sheet (Messages' own process): the draft with the link.
        let messages = XCUIApplication(bundleIdentifier: "com.apple.MobileSMS")
        _ = waitTaking([messages.navigationBars["New Message"], messages.staticTexts["New Message"], messages.textViews.firstMatch], timeout: 20)
        frames(for: 4)
        // Discard: the X in the compose sheet, then "Delete Draft" if offered.
        let close = messages.buttons.matching(NSPredicate(format: "label == 'Cancel' OR label == 'Close' OR identifier == 'Cancel'")).firstMatch
        if close.waitForExistence(timeout: 5) { close.tap() }
        let delete = springboard.buttons["Delete Draft"]
        if delete.waitForExistence(timeout: 4) { delete.tap() }
        let delete2 = messages.buttons["Delete Draft"]
        if delete2.waitForExistence(timeout: 2) { delete2.tap() }
        frames(for: 1)
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
