import XCTest
import Darwin

/// Runs only against the isolated screenshot-account simulator.
/// Does not seed data, submit claims, purchase, or post anything.
final class FlyRightSocialCapture: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "com.shanavasshaji.flyright")

    override func setUpWithError() throws { continueAfterFailure = false }

    private func hold(_ seconds: Double) { Thread.sleep(forTimeInterval: seconds) }

    private func mark(_ name: String) {
        print("SOCIAL_CAPTURE_\(name) \(Date().timeIntervalSince1970)")
        fflush(stdout)
    }

    private func snapshot(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    private func tab(_ title: String) {
        let button = app.tabBars.buttons[title]
        XCTAssertTrue(button.waitForExistence(timeout: 20), "Missing tab: \(title)")
        button.tap()
        XCTAssertTrue(button.isSelected, "Tab was not selected: \(title)")
    }

    private func drag(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: x1, dy: y1))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: x2, dy: y2))
        start.press(forDuration: 0.08, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.15)
    }

    func testInspect() {
        app.activate()
        hold(3)
        snapshot("current-screen")
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "screen-hierarchy"
        tree.lifetime = .keepAlways
        add(tree)
        print(app.debugDescription)
    }

    func testTour() {
        app.activate()
        // Warm images/data before the recorded take. The current account must
        // be the synthetic screenshot profile, never a personal account.
        tab("Flights")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Maja'")).firstMatch.waitForExistence(timeout: 30), "Screenshot account Maja must be signed in")
        for title in ["Updates", "Friends", "World", "Claims", "Flights"] {
            tab(title)
            hold(2)
            snapshot("prepared-\(title.lowercased())")
        }
        mark("READY")
        hold(5)

        mark("FLIGHTS")
        hold(1.5)
        drag(0.53, 0.76, 0.53, 0.42)
        hold(1.0)
        drag(0.53, 0.42, 0.53, 0.79)
        hold(1.2)
        snapshot("01-flights")

        mark("UPDATES")
        tab("Updates")
        hold(1.5)
        drag(0.53, 0.78, 0.53, 0.43)
        hold(1.2)
        drag(0.53, 0.43, 0.53, 0.78)
        hold(1)
        snapshot("02-updates")

        mark("FRIENDS")
        tab("Friends")
        hold(1.5)
        drag(0.53, 0.76, 0.53, 0.47)
        hold(1.0)
        drag(0.53, 0.44, 0.53, 0.76)
        hold(1)
        snapshot("03-friends")

        mark("WORLD")
        tab("World")
        hold(1.5)
        drag(0.64, 0.51, 0.43, 0.52)
        hold(2)
        snapshot("04-world")

        mark("CLAIMS")
        tab("Claims")
        hold(2.5)
        snapshot("05-claims")

        mark("RETURN")
        tab("Flights")
        hold(2.5)
        mark("DONE")
    }
}
