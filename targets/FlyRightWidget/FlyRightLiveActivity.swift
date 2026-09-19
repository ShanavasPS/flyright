// FlyRight travel-day Live Activity (lock screen + Dynamic Island).
//
// The onesignal-expo-plugin copies this file into the FlyRightWidget target
// AS OneSignalWidgetLiveActivity.swift at prebuild, and its bundle file
// instantiates `OneSignalWidgetLiveActivity()` — so the widget struct MUST
// keep that name even though this source file is FlyRight-branded.
//
// Content-state keys are the LiveContent contract produced by
// src/services/travel-day.ts#liveContent and sent via
// src/services/live-activity.ts (the server mirror is buildContentState in
// convex/liveShared.ts) — keep them in sync:
//   attributes: journeyId, title, fromCode, toCode, flightLabel, airline, deepLink (followers)
//   state: clockLabel ("DEPARTS IN" | "BOARDING" | "LANDS IN" | "LANDED 17:08"),
//          tone ("normal" | "boarding" | "delay" | "landed"),
//          leadLabel / leadValue / leadSub (the one fact beside the clock —
//          terminal, check-in desk, gate, seat, belt), delayChip ("+46 min"),
//          compactLabel (the island's word for the lead: "T2", "G53", "14A"),
//          countdownEnd (ms since epoch, 0 = unknown), countdownKind
//          ("departure" | "arrival" | ""), progress (0…1, flight progress),
//          depTime, arrTime — plus headline, subtitle, gate, terminal,
//          delayLabel, emphasis, which older builds of this widget read and
//          this one only falls back on.
//
// Every surface follows one rule (liveLead in convex/liveShared.ts): the big
// clock, the one fact that matters at this step, and the route line. The
// clock ticks on the device itself (see ClockText), so the card stays right
// with the phone offline; a push only moves its anchor.

import ActivityKit
import WidgetKit
import SwiftUI
import UIKit
import OneSignalLiveActivities

/// Brand palette — mirrors the navy card treatment in the app
/// (src/components/travel-day-banner.tsx).
private enum Brand {
    static let navy = Color(red: 0.047, green: 0.106, blue: 0.212)      // #0C1B36
    static let white = Color(red: 0.949, green: 0.965, blue: 0.984)     // #F2F6FB
    static let whiteDim = Color(red: 0.949, green: 0.965, blue: 0.984).opacity(0.62)
    static let whiteFaint = Color(red: 0.949, green: 0.965, blue: 0.984).opacity(0.16)
    static let cobalt = Color(red: 0.498, green: 0.694, blue: 0.949)    // #7FB1F2
    static let amber = Color(red: 0.949, green: 0.706, blue: 0.255)     // #F2B441
    static let green = Color(red: 0.184, green: 0.839, blue: 0.549)     // #2FD68C
}

private enum Tone: String {
    case normal, boarding, delay, landed

    var color: Color {
        switch self {
        case .normal: return Brand.cobalt
        case .boarding, .landed: return Brand.green
        case .delay: return Brand.amber
        }
    }
}

/// Typed view over the loosely-typed OneSignal default-attributes dicts.
private struct TravelDayModel {
    let journeyId: String
    let followerDeepLink: String?
    let title: String
    let fromCode: String?
    let toCode: String?
    /// "Finnair AY1337" over the route line — the airline's name with the
    /// designator (attributes; older activities carry only the designator).
    let flightCaption: String?
    /// "3h 5m" under the route line: the scheduled-or-estimated block time.
    let flightTime: String?
    /// "Flight in 3h" / "Lands in 40 min" / "Landed" — only a fallback here,
    /// for pushes from builds that predate clockLabel and for the moment a
    /// countdown has run out.
    let headline: String?
    let progress: Double
    let compactLabel: String?
    let depTime: String?
    let arrTime: String?
    /// The big clock's label, the tone that colours it, and the one fact
    /// beside it — resolved with fallbacks for older content states.
    let clockLabel: String
    let tone: Tone
    let lead: (label: String, value: String, sub: String?)?
    let delayChip: String?
    /// The instant the live countdown runs to, and whether it is the
    /// departure or the arrival. Nil once landed or when unknown.
    let countdownEnd: Date?
    let countdownKind: String?

    init(context: ActivityViewContext<DefaultLiveActivityAttributes>) {
        // Empty strings travel as "not set" (the JS side can't send nils
        // through the OneSignal dict) — treat them as nil here.
        func text(_ value: String?) -> String? {
            guard let value, !value.isEmpty else { return nil }
            return value
        }
        // JSON integers decode as Int, and asDouble() is nil for those — a
        // whole-number progress (0, 1) or a millisecond instant would read
        // as missing without this.
        func number(_ value: AnyCodable?) -> Double? {
            guard let value else { return nil }
            return value.asDouble() ?? value.asInt().map(Double.init)
        }
        let state = context.state.data
        journeyId = context.attributes.data["journeyId"]?.asString() ?? ""
        followerDeepLink = text(context.attributes.data["deepLink"]?.asString())
        title = text(context.attributes.data["title"]?.asString()) ?? "Travel day"
        fromCode = text(context.attributes.data["fromCode"]?.asString())
        toCode = text(context.attributes.data["toCode"]?.asString())
        let flightLabel = text(context.attributes.data["flightLabel"]?.asString())
        let airline = text(context.attributes.data["airline"]?.asString())
        if let airline, let flightLabel, flightLabel != airline {
            flightCaption = "\(airline) \(flightLabel)"
        } else {
            flightCaption = flightLabel ?? airline
        }
        let departsMs = number(context.state.data["departsAt"]) ?? 0
        let arrivesMs = number(context.state.data["arrivesAt"]) ?? 0
        if departsMs > 0, arrivesMs > departsMs {
            let minutes = Int(((arrivesMs - departsMs) / 60_000).rounded())
            flightTime = minutes >= 60
                ? (minutes % 60 == 0 ? "\(minutes / 60)h" : "\(minutes / 60)h \(minutes % 60)m")
                : "\(minutes)m"
        } else {
            flightTime = nil
        }
        headline = text(state["headline"]?.asString())
        progress = min(1, max(0, number(state["progress"]) ?? 0))
        compactLabel = text(state["compactLabel"]?.asString())
        depTime = text(state["depTime"]?.asString())
        arrTime = text(state["arrTime"]?.asString())
        let endMs = number(state["countdownEnd"]) ?? 0
        countdownEnd = endMs > 0 ? Date(timeIntervalSince1970: endMs / 1000) : nil
        countdownKind = text(state["countdownKind"]?.asString())

        // Older states carry no lead keys: read the clock label off the
        // countdown's kind, the tone off the old emphasis, and show no fact.
        let landedHeadline = headline?.lowercased().hasPrefix("landed") == true
        clockLabel = text(state["clockLabel"]?.asString())
            ?? (landedHeadline ? "LANDED" : countdownKind == "arrival" ? "LANDS IN" : "DEPARTS IN")
        tone = text(state["tone"]?.asString()).flatMap(Tone.init(rawValue:))
            ?? (state["emphasis"]?.asString() == "delay" ? .delay : landedHeadline ? .landed : .normal)
        if let value = text(state["leadValue"]?.asString()) {
            lead = (text(state["leadLabel"]?.asString()) ?? "", value, text(state["leadSub"]?.asString()))
        } else {
            lead = nil
        }
        delayChip = text(state["delayChip"]?.asString())
    }

    /// The instant the clock counts to — nil once it has passed: a closed
    /// range can't run backwards, and a clock stuck at 0:00 says nothing.
    var countdown: Date? {
        guard let countdownEnd, countdownEnd > Date() else { return nil }
        return countdownEnd
    }

    var landed: Bool { tone == .landed }

    /// What the big slot says when there is no clock to tick: the
    /// destination once landed, the old headline ("Departing now") before.
    var clockWord: String {
        if landed { return toCode ?? "Landed" }
        return headline ?? (countdownKind == "arrival" ? "Landing now" : "Departing now")
    }

    /// The glyph beside the clock's label.
    var symbol: String {
        if landed { return "checkmark.circle.fill" }
        return countdownKind == "arrival" || clockLabel == "LANDS IN" ? "airplane.arrival" : "airplane.departure"
    }

    /// The Dynamic Island's glyph: in the air a plane, after landing the
    /// bag, before that the take-off.
    var islandSymbol: String {
        if landed { return lead != nil ? "suitcase.rolling.fill" : "checkmark.circle.fill" }
        return countdownKind == "arrival" ? "airplane" : "airplane.departure"
    }

    /// Both route endpoints or nothing — a single code can't make the
    /// route line, so callers fall back to the pre-joined title.
    var route: (from: String, to: String)? {
        guard let fromCode, let toCode else { return nil }
        return (fromCode, toCode)
    }

    var deepLink: URL? {
        if let followerDeepLink, followerDeepLink.hasPrefix("flyright://following/") {
            return URL(string: followerDeepLink)
        }
        return URL(string: "flyright://journey/\(journeyId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? journeyId)")
    }
}

struct OneSignalWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        // watchOS 11+ mirrors Live Activities into the watch Smart Stack;
        // offering the .small family swaps the shrunken lock-screen card for
        // the wrist-sized layout below. The modifier is iOS 18-only and this
        // target deploys to 16.2, so branch — SE-0360 lets the #available
        // arm return a different underlying WidgetConfiguration type.
        if #available(iOS 18.0, *) {
            return activityConfiguration.supplementalActivityFamilies([.small])
        }
        return activityConfiguration
    }

    private var activityConfiguration: some WidgetConfiguration {
        ActivityConfiguration(for: DefaultLiveActivityAttributes.self) { context in
            TravelDayCard(model: TravelDayModel(context: context))
                .widgetURL(TravelDayModel(context: context).deepLink)
        } dynamicIsland: { context in
            let model = TravelDayModel(context: context)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        ClockLabelRow(model: model, size: 10)
                        BigClock(model: model, size: 36, marks: false)
                    }
                    .layoutPriority(1)
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let lead = model.lead {
                        LeadFact(lead: lead, tone: model.tone, size: 28)
                            .padding(.trailing, 4)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    RouteLine(model: model, codeSize: 12)
                        .padding(.horizontal, 4)
                        .padding(.top, 4)
                }
            } compactLeading: {
                // The one fact, in a word: "T2", "G53", "14A", "Belt 7".
                HStack(spacing: 4) {
                    Image(systemName: model.islandSymbol)
                        .foregroundStyle(model.tone.color)
                    if let word = model.compactLabel {
                        Text(word)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Brand.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                }
            } compactTrailing: {
                // Time to (estimated) departure, then to landing — ticking
                // on-device, re-anchored by every push that moves the estimate.
                if let end = model.countdown {
                    ClockText(end: end, size: 15, color: model.tone.color)
                } else {
                    Image(systemName: model.landed ? "checkmark.circle.fill" : "airplane")
                        .foregroundStyle(model.tone.color)
                }
            } minimal: {
                // Boarding: the gate is the thing to see; otherwise the clock.
                if model.tone == .boarding, let word = model.compactLabel {
                    Text(word)
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundStyle(model.tone.color)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                } else if let end = model.countdown {
                    ClockText(end: end, size: 12, color: model.tone.color)
                } else if let word = model.compactLabel {
                    Text(word)
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundStyle(model.tone.color)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                } else {
                    Image(systemName: model.islandSymbol)
                        .foregroundStyle(model.tone.color)
                }
            }
            .widgetURL(model.deepLink)
            .keylineTint(model.tone.color)
        }
    }
}

/// Routes the activity content by family: the card everywhere except the
/// watch Smart Stack (.small), which gets the wrist layout. Pre-iOS 18 the
/// family environment doesn't exist, so it's always the card.
private struct TravelDayCard: View {
    let model: TravelDayModel

    var body: some View {
        if #available(iOS 18.0, *) {
            FamilyRoutedCard(model: model)
        } else {
            LockScreenView(model: model)
        }
    }
}

@available(iOS 18.0, *)
private struct FamilyRoutedCard: View {
    @Environment(\.activityFamily) private var family
    let model: TravelDayModel

    var body: some View {
        switch family {
        case .small:
            SmartStackView(model: model)
        default:
            LockScreenView(model: model)
        }
    }
}

/// The lock-screen card: the clock's label over the big countdown on the
/// left, the one fact that matters at this step on the right, and the route
/// line — codes, clocks and the plane on its progress — beneath both.
private struct LockScreenView: View {
    let model: TravelDayModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    ClockLabelRow(model: model, size: 11)
                    BigClock(model: model, size: 52, marks: true)
                }
                .layoutPriority(1)
                Spacer(minLength: 8)
                if let lead = model.lead {
                    LeadFact(lead: lead, tone: model.tone, size: 38)
                }
            }
            RouteLine(model: model, codeSize: 13, captions: true)
        }
        .padding(16)
        .activityBackgroundTint(Brand.navy)
        .activitySystemActionForegroundColor(Brand.white)
    }
}

/// The watch Smart Stack tile — wrist space is about two rows: the clock and
/// its label with the fact beside it, then the thin progress line.
@available(iOS 18.0, *)
private struct SmartStackView: View {
    let model: TravelDayModel

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ClockLabelRow(model: model, size: 9)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                BigClock(model: model, size: 24, marks: false)
                Spacer(minLength: 4)
                if let lead = model.lead {
                    Text(lead.label == "GATE" ? "G\(lead.value)" : lead.value)
                        .font(.system(size: 16, weight: .heavy, design: .rounded))
                        .foregroundStyle(model.tone == .boarding ? Brand.green : Brand.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
            ProgressTrack(progress: model.progress, color: model.tone == .delay ? Brand.amber : Brand.cobalt)
        }
        .padding(10)
        .activityBackgroundTint(Brand.navy)
        .activitySystemActionForegroundColor(Brand.white)
    }
}

/// "✈ DEPARTS IN  +46 min" — the clock's label in the tone's colour, with
/// the late chip beside it while the flight runs half an hour or more late.
private struct ClockLabelRow: View {
    let model: TravelDayModel
    let size: CGFloat

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: model.symbol)
                .font(.system(size: size + 2, weight: .semibold))
            Text(model.clockLabel)
                .font(.system(size: size, weight: .heavy))
                .kerning(1.2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if let chip = model.delayChip {
                Text(chip)
                    .font(.system(size: size + 1, weight: .bold))
                    .foregroundStyle(Brand.amber)
                    .lineLimit(1)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Brand.amber.opacity(0.16), in: Capsule())
            }
        }
        .foregroundStyle(model.tone.color)
    }
}

/// The big slot: the ticking countdown with its HRS / MIN marks, or — with
/// no clock to run — a word (the destination once landed, "Departing now").
private struct BigClock: View {
    let model: TravelDayModel
    let size: CGFloat
    let marks: Bool

    var body: some View {
        if let end = model.countdown {
            let clock = ClockText(end: end, size: size, color: model.tone == .delay ? Brand.amber : Brand.white)
            if marks {
                clock
                    .padding(.bottom, 11)
                    .overlay(alignment: .bottom) {
                        HStack(spacing: 0) {
                            Text("HRS")
                            Spacer(minLength: 4)
                            Text("MIN")
                        }
                        .font(.system(size: 8, weight: .bold))
                        .kerning(1)
                        .foregroundStyle(Brand.whiteDim)
                        .padding(.horizontal, size * 0.06)
                    }
            } else {
                clock
            }
        } else {
            Text(model.clockWord)
                .font(.system(size: size * 0.72, weight: .heavy, design: .rounded))
                .foregroundStyle(Brand.white)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
    }
}

/// A countdown that shows hours and minutes and ticks on the device.
///
/// There is no system format for a bare "2:14": iOS 18's `.timer` and
/// `.offset` styles spell the units out, and a custom format style makes the
/// whole activity render as redacted placeholders (Live Activity views are
/// archived and decoded in the system process, which can't decode a private
/// type). So the timer is the standard `Text(timerInterval:)` — "2:14:05" —
/// laid over a transparent "0:00" in the same font and clipped to it: the digits
/// are monospaced, so the first four characters fill the reference exactly
/// and the ":05" falls outside the clip. Ten hours or more out the reference
/// is "00:00". Only system types, so the archive decodes.
private struct ClockText: View {
    let end: Date
    let size: CGFloat
    let color: Color

    /// iOS's timer drops the hour below sixty minutes ("57:12", not
    /// "0:57:12"), and the card can't re-lay itself out at that moment — the
    /// Lock Screen only redraws on an update. So under ten hours the timer
    /// counts to ten hours PAST the real end: it always reads "1H:MM:SS",
    /// and cropping one digit off the front and the seconds off the back
    /// leaves "H:MM" — 1:23, then 0:57, 0:05 — with no layout change on the
    /// way. It pauses at the real end, frozen on "0:00". Ten hours or more
    /// out, the plain timer's "HH:MM" is cropped at the back only.
    private static let shift: TimeInterval = 10 * 3600

    var body: some View {
        let font = Font.system(size: size, weight: .heavy, design: .rounded)
        let long = end.timeIntervalSinceNow >= Self.shift
        let reference = long ? "00:00" : "0:00"
        let range = long ? Date()...end : Date()...end.addingTimeInterval(Self.shift)
        Text(reference)
            .font(font)
            .monospacedDigit()
            .lineLimit(1)
            // Clear, not .hidden(): a hidden view hides its overlay too,
            // and the clock rendered as nothing on the Lock Screen.
            .foregroundStyle(.clear)
            // The clock never gives up width: a long gate or desk beside
            // it shrinks instead (LeadFact).
            .fixedSize()
            .accessibilityHidden(true)
            .overlay(alignment: .leading) {
                Text(timerInterval: range, pauseTime: long ? nil : end, countsDown: true, showsHours: true)
                    .font(font)
                    .monospacedDigit()
                    .foregroundStyle(color)
                    .lineLimit(1)
                    .multilineTextAlignment(.leading)
                    // A wide, leading-aligned box — not .fixedSize(), which
                    // rendered nothing on the Lock Screen, and not the clip's
                    // own width, which truncates to "1:…".
                    .frame(width: size * 6, alignment: .leading)
                    // Slide the leading "1" out of the clip.
                    .offset(x: long ? 0 : -Self.digitWidth(size))
            }
            .clipped()
    }

    /// One tabular digit's advance in the clock's font, measured from the
    /// system font itself (it runs 0.68–0.71 of the size, so no one ratio
    /// fits every clock). Plain arithmetic at render time — nothing custom
    /// lands in the archived view.
    private static func digitWidth(_ size: CGFloat) -> CGFloat {
        var descriptor = UIFont.systemFont(ofSize: size, weight: .heavy).fontDescriptor
        descriptor = descriptor.withDesign(.rounded) ?? descriptor
        descriptor = descriptor.addingAttributes([
            .featureSettings: [[
                UIFontDescriptor.FeatureKey.type: kNumberSpacingType,
                UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector,
            ]],
        ])
        let font = UIFont(descriptor: descriptor, size: size)
        return ("0" as NSString).size(withAttributes: [.font: font]).width
    }
}

/// The one fact beside the clock, right-aligned: "GATE" / "53" / "Boards
/// 15:30". Green while boarding (the gate is the task), white otherwise.
private struct LeadFact: View {
    let lead: (label: String, value: String, sub: String?)
    let tone: Tone
    let size: CGFloat

    var body: some View {
        VStack(alignment: .trailing, spacing: 1) {
            if !lead.label.isEmpty {
                Text(lead.label)
                    .font(.system(size: 10, weight: .bold))
                    .kerning(1.2)
                    .foregroundStyle(Brand.whiteDim)
                    .lineLimit(1)
            }
            Text(lead.value)
                .font(.system(size: size, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tone == .boarding || tone == .landed ? Brand.green : Brand.white)
                .lineLimit(1)
                // Room for "Rows 101–140": down to half size before it
                // truncates — never at the clock's expense (the clock's
                // column has layout priority and a fixed width).
                .minimumScaleFactor(0.5)
            if let sub = lead.sub {
                Text(sub)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Brand.whiteDim)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .multilineTextAlignment(.trailing)
    }
}

/// The route as one thin line: origin code and clock, the progress bar with
/// the plane riding its edge (parked at the origin until take-off), the
/// destination code and clock. Pre-route activities show the title instead.
private struct RouteLine: View {
    let model: TravelDayModel
    let codeSize: CGFloat
    /// Lock Screen only: the airline and flight over the bar, the flight
    /// time under it — boarding-pass style, in the space the bar leaves.
    var captions = false

    var body: some View {
        if let route = model.route {
            HStack(spacing: 10) {
                endpoint(code: route.from, time: model.depTime, alignment: .leading)
                VStack(spacing: 1) {
                    if captions, let name = model.flightCaption {
                        caption(name)
                    }
                    ProgressTrack(
                        progress: model.progress,
                        color: model.tone == .delay ? Brand.amber : Brand.cobalt
                    )
                    if captions, let time = model.flightTime {
                        caption(time)
                    }
                }
                endpoint(code: route.to, time: model.arrTime, alignment: .trailing)
            }
        } else {
            Text(model.title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Brand.white)
                .lineLimit(1)
        }
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .kerning(0.4)
            .foregroundStyle(Brand.whiteDim)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }

    private func endpoint(code: String, time: String?, alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 0) {
            Text(code)
                .font(.system(size: codeSize, weight: .heavy))
                .kerning(0.4)
                .foregroundStyle(Brand.white)
                .lineLimit(1)
            if let time {
                Text(time)
                    .font(.system(size: codeSize - 2, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.whiteDim)
                    .lineLimit(1)
            }
        }
    }
}

/// Thin progress track with the plane riding the fill edge. Flight progress:
/// the plane sits at the start until departure.
private struct ProgressTrack: View {
    let progress: Double
    let color: Color

    private let planeSize: CGFloat = 13

    var body: some View {
        GeometryReader { geo in
            let travel = max(0, geo.size.width - planeSize)
            let x = travel * progress
            ZStack(alignment: .leading) {
                Capsule().fill(Brand.whiteFaint).frame(height: 4)
                Capsule()
                    .fill(color)
                    .frame(width: x + planeSize / 2, height: 4)
                Image(systemName: "airplane")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Brand.white)
                    .frame(width: planeSize, height: planeSize)
                    .offset(x: x)
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .leading)
        }
        .frame(height: 14)
    }
}
