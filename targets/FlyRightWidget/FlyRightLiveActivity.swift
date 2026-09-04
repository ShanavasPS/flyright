// FlyRight travel-day Live Activity (lock screen + Dynamic Island).
//
// The onesignal-expo-plugin copies this file into the FlyRightWidget target
// AS OneSignalWidgetLiveActivity.swift at prebuild, and its bundle file
// instantiates `OneSignalWidgetLiveActivity()` — so the widget struct MUST
// keep that name even though this source file is FlyRight-branded.
//
// Content-state keys are the LiveContent contract produced by
// src/services/travel-day.ts#liveContent and sent via
// src/services/live-activity.ts — keep the two files in sync:
//   attributes: journeyId, title, fromCode, toCode, flightLabel
//   state: headline, subtitle, progress (0…1, flight progress: 0 until
//          departure, then time-based, 1 landed), stageLabel, compactLabel,
//          gate, terminal, delayLabel, emphasis ("none" | "delay" | "gate"),
//          depTime, arrTime

import ActivityKit
import WidgetKit
import SwiftUI
import OneSignalLiveActivities

/// Brand palette — mirrors the navy card treatment in the app
/// (src/components/travel-day-banner.tsx).
private enum Brand {
    static let navy = Color(red: 0.047, green: 0.106, blue: 0.212)      // #0C1B36
    static let navyLift = Color(red: 0.110, green: 0.204, blue: 0.349)  // #1C3459
    static let white = Color(red: 0.949, green: 0.965, blue: 0.984)     // #F2F6FB
    static let whiteDim = Color(red: 0.949, green: 0.965, blue: 0.984).opacity(0.62)
    static let whiteFaint = Color(red: 0.949, green: 0.965, blue: 0.984).opacity(0.16)
    static let cobalt = Color(red: 0.498, green: 0.694, blue: 0.949)    // #7FB1F2
    static let amber = Color(red: 0.949, green: 0.706, blue: 0.255)     // #F2B441
}

/// Typed view over the loosely-typed OneSignal default-attributes dicts.
private struct TravelDayModel {
    let journeyId: String
    let title: String
    let fromCode: String?
    let toCode: String?
    let flightLabel: String?
    /// "Flight in 3h" / "Lands in 40 min" / "Landed" — the card's header.
    /// Nil on updates pushed by builds that predate the key.
    let headline: String?
    let subtitle: String
    let progress: Double
    let stageLabel: String?
    let compactLabel: String?
    let gate: String?
    let terminal: String?
    let depTime: String?
    let arrTime: String?
    let delayLabel: String?
    let delayed: Bool

    init(context: ActivityViewContext<DefaultLiveActivityAttributes>) {
        // Empty strings travel as "not set" (the JS side can't send nils
        // through the OneSignal dict) — treat them as nil here.
        func text(_ value: String?) -> String? {
            guard let value, !value.isEmpty else { return nil }
            return value
        }
        journeyId = context.attributes.data["journeyId"]?.asString() ?? ""
        title = text(context.attributes.data["title"]?.asString()) ?? "Travel day"
        fromCode = text(context.attributes.data["fromCode"]?.asString())
        toCode = text(context.attributes.data["toCode"]?.asString())
        flightLabel = text(context.attributes.data["flightLabel"]?.asString())
        headline = text(context.state.data["headline"]?.asString())
        subtitle = text(context.state.data["subtitle"]?.asString()) ?? "Following your trip"
        progress = min(1, max(0, context.state.data["progress"]?.asDouble() ?? 0))
        stageLabel = text(context.state.data["stageLabel"]?.asString())
        compactLabel = text(context.state.data["compactLabel"]?.asString())
        gate = text(context.state.data["gate"]?.asString())
        terminal = text(context.state.data["terminal"]?.asString())
        depTime = text(context.state.data["depTime"]?.asString())
        arrTime = text(context.state.data["arrTime"]?.asString())
        delayLabel = text(context.state.data["delayLabel"]?.asString())
        delayed = context.state.data["emphasis"]?.asString() == "delay"
    }

    /// Both route endpoints or nothing — a single code can't make the
    /// boarding-pass row, so callers fall back to the pre-joined title.
    var route: (from: String, to: String)? {
        guard let fromCode, let toCode else { return nil }
        return (fromCode, toCode)
    }

    var deepLink: URL? {
        URL(string: "flyright://journey/\(journeyId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? journeyId)")
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
                    if let route = model.route {
                        HStack(spacing: 4) {
                            Text(route.from)
                            Image(systemName: "airplane")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(model.delayed ? Brand.amber : Brand.cobalt)
                            Text(route.to)
                        }
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Brand.white)
                        .lineLimit(1)
                    } else {
                        Text(model.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Brand.white)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let gate = model.gate {
                        Text("Gate \(gate)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Brand.cobalt)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(model.subtitle)
                                .font(.footnote)
                                .foregroundStyle(Brand.whiteDim)
                                .lineLimit(1)
                            Spacer(minLength: 8)
                            if let headline = model.headline {
                                Text(headline)
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(Brand.white)
                                    .lineLimit(1)
                                    .layoutPriority(1)
                            }
                        }
                        ContrailProgress(progress: model.progress, delayed: model.delayed)
                    }
                }
            } compactLeading: {
                Image(systemName: "airplane")
                    .foregroundStyle(model.delayed ? Brand.amber : Brand.cobalt)
            } compactTrailing: {
                if let delay = model.delayLabel {
                    Text(delay)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Brand.amber)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                } else if let word = model.compactLabel {
                    // One word of status ("Security", "G12", "Boarded") —
                    // the JS model picks it; see LiveContent.compactLabel.
                    Text(word)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Brand.cobalt)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                } else {
                    // Pre-compactLabel app versions: static progress ring —
                    // NEVER a ProgressView spinner here: widgets don't
                    // animate it, so it reads as a stuck loader.
                    Circle()
                        .trim(from: 0, to: max(0.06, model.progress))
                        .stroke(Brand.cobalt, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .frame(width: 14, height: 14)
                }
            } minimal: {
                Image(systemName: "airplane")
                    .foregroundStyle(model.delayed ? Brand.amber : Brand.cobalt)
            }
            .widgetURL(model.deepLink)
            .keylineTint(Brand.cobalt)
        }
    }
}

/// Routes the activity content by family: the boarding-pass card everywhere
/// except the watch Smart Stack (.small), which gets the wrist layout.
/// Pre-iOS 18 the family environment doesn't exist, so it's always the card.
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

/// The watch Smart Stack tile — one glance: route, the single status that
/// matters most (delay beats gate beats stage word), subtitle, progress.
/// Wrist space is ~two text rows, so the boarding-pass hierarchy is out.
@available(iOS 18.0, *)
private struct SmartStackView: View {
    let model: TravelDayModel

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                if let route = model.route {
                    Text(route.from)
                    Image(systemName: "airplane")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(model.delayed ? Brand.amber : Brand.cobalt)
                    Text(route.to)
                } else {
                    Text(model.title)
                }
                Spacer(minLength: 4)
                if let status {
                    Text(status.text)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(status.color)
                        .minimumScaleFactor(0.8)
                }
            }
            .font(.system(.subheadline, design: .rounded).weight(.bold))
            .foregroundStyle(Brand.white)
            .lineLimit(1)

            Text([model.headline, model.subtitle].compactMap { $0 }.joined(separator: " · "))
                .font(.caption2)
                .foregroundStyle(Brand.whiteDim)
                .lineLimit(1)

            ContrailProgress(progress: model.progress, delayed: model.delayed)
        }
        .padding(10)
        .activityBackgroundTint(Brand.navy)
        .activitySystemActionForegroundColor(Brand.white)
    }

    private var status: (text: String, color: Color)? {
        if let delay = model.delayLabel { return (delay, Brand.amber) }
        if let gate = model.gate { return ("Gate \(gate)", Brand.cobalt) }
        if let word = model.compactLabel { return (word, Brand.cobalt) }
        return nil
    }
}

/// The lock-screen card, boarding-pass style — the same hierarchy as the
/// in-app travel-day hero: brand chip + headline ("FLIGHT IN 3H"), big route
/// codes joined by a dotted contrail that doubles as the flight-progress
/// bar (the plane waits at the origin until take-off, then flies the line),
/// the next-step line, then flight/gate/terminal facts.
private struct LockScreenView: View {
    let model: TravelDayModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                BrandChip()
                if let headline = model.headline {
                    Text(headline.uppercased())
                        .font(.caption2.weight(.bold))
                        .kerning(1.2)
                        .foregroundStyle(Brand.whiteDim)
                        .lineLimit(1)
                }
                Spacer()
                if let delay = model.delayLabel {
                    ChipView(text: delay, color: Brand.amber)
                }
            }

            if let route = model.route {
                RouteRow(
                    from: route.from,
                    to: route.to,
                    depTime: model.depTime,
                    arrTime: model.arrTime,
                    progress: model.progress,
                    delayed: model.delayed
                )
            } else {
                // Activities started by builds before the route layout only
                // carry the pre-joined title.
                Text(model.title)
                    .font(.headline)
                    .foregroundStyle(Brand.white)
                    .lineLimit(1)
            }

            Text(model.subtitle)
                .font(.footnote)
                .foregroundStyle(Brand.whiteDim)
                .lineLimit(1)

            if let facts = factsLine {
                Text(facts)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Brand.cobalt)
                    .lineLimit(1)
            }
        }
        .padding(14)
        .activityBackgroundTint(Brand.navy)
        .activitySystemActionForegroundColor(Brand.white)
    }

    /// "LH873 · Gate A12 · Terminal 2" — the flight designator sits with the
    /// other details, matching the in-app hero's fact line.
    private var factsLine: String? {
        let parts = [
            model.flightLabel,
            model.gate.map { "Gate \($0)" },
            model.terminal.map { "Terminal \($0)" },
        ].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// Big origin/destination codes pinned to opposite edges, times beneath,
/// a dotted contrail between them that the plane flies as the flight
/// progresses.
private struct RouteRow: View {
    let from: String
    let to: String
    let depTime: String?
    let arrTime: String?
    let progress: Double
    let delayed: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            endpoint(code: from, time: depTime, alignment: .leading)
            // Top-aligned so the path meets the codes' midline instead of
            // sagging toward the time row beneath them.
            RoutePath(progress: progress, delayed: delayed)
                .padding(.top, 8)
            endpoint(code: to, time: arrTime, alignment: .trailing)
        }
    }

    private func endpoint(code: String, time: String?, alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 1) {
            Text(code)
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .kerning(0.5)
                .foregroundStyle(Brand.white)
                .lineLimit(1)
            if let time {
                Text(time)
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(Brand.whiteDim)
                    .lineLimit(1)
            }
        }
    }
}

/// The route line as progress bar: endpoint dots, a dotted contrail across,
/// the flown part drawn solid, and the brand plane at the progress point —
/// parked at the origin until the flight departs.
private struct RoutePath: View {
    let progress: Double
    let delayed: Bool

    private let planeSize: CGFloat = 14

    var body: some View {
        GeometryReader { geo in
            let travel = max(0, geo.size.width - planeSize)
            let x = travel * progress
            ZStack(alignment: .leading) {
                HStack(spacing: 0) {
                    Circle().fill(Brand.whiteDim).frame(width: 3, height: 3)
                    dottedLine
                    Circle().fill(Brand.whiteDim).frame(width: 3, height: 3)
                }
                HorizontalLine()
                    .stroke(
                        (delayed ? Brand.amber : Brand.cobalt).opacity(0.7),
                        style: StrokeStyle(lineWidth: 2, lineCap: .round)
                    )
                    .frame(width: max(0, x + planeSize / 2), height: 2)
                Image(systemName: "airplane")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(delayed ? Brand.amber : Brand.cobalt)
                    .frame(width: planeSize, height: planeSize)
                    .offset(x: x)
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .leading)
        }
        .frame(height: 14)
    }

    private var dottedLine: some View {
        HorizontalLine()
            .stroke(
                Brand.white.opacity(0.35),
                style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [0.1, 5])
            )
            .frame(height: 2)
            .padding(.horizontal, 5)
    }
}

private struct HorizontalLine: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 0, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.width, y: rect.midY))
        return path
    }
}

/// The FlyRight mark on a white chip — the app icon at widget scale. Drawn
/// in SwiftUI (Live Activities can't fetch images and the widget target has
/// no asset catalog); geometry mirrors scripts/generate-icons.mjs.
private struct BrandChip: View {
    var body: some View {
        ContrailCheckMark(color: Brand.navy)
            .frame(width: 16, height: 16)
            .frame(width: 22, height: 22)
            .background(Brand.white, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
}

/// "The contrail check": an airliner climbing at 45° whose dotted contrail
/// sweeps into a checkmark. Laid out in the icon script's 120-point box and
/// scaled to whatever frame it's given.
private struct ContrailCheckMark: View {
    let color: Color

    /// Vapor dots tail → tip: (x, y, radius, opacity) in the 120-box.
    private static let dots: [(CGFloat, CGFloat, CGFloat, Double)] = [
        (20, 64, 3.6, 0.42),
        (31, 75, 4.1, 0.55),
        (42, 86, 4.6, 0.66),
        (51, 77, 5.1, 0.78),
        (60, 68, 5.6, 0.9),
        (69, 59, 6.2, 1),
    ]

    var body: some View {
        GeometryReader { geo in
            let s = min(geo.size.width, geo.size.height) / 120
            ZStack(alignment: .topLeading) {
                ForEach(Array(Self.dots.enumerated()), id: \.offset) { _, dot in
                    Circle()
                        .fill(color.opacity(dot.3))
                        .frame(width: dot.2 * 2 * s, height: dot.2 * 2 * s)
                        .offset(x: (dot.0 - dot.2) * s, y: (dot.1 - dot.2) * s)
                }
                // Plane: the 24-box glyph scaled ×2.1, centred at (90, 32),
                // rotated 45° so it climbs up-right.
                PlaneShape()
                    .fill(color)
                    .frame(width: 24 * 2.1 * s, height: 24 * 2.1 * s)
                    .rotationEffect(.degrees(45))
                    .offset(x: (90 - 11.5 * 2.1) * s, y: (32 - 12 * 2.1) * s)
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
        }
    }
}

/// Material "flight" airliner silhouette in a 24×24 box, nose up — the same
/// path the app icon and the Android tracker icon use.
private struct PlaneShape: Shape {
    func path(in rect: CGRect) -> Path {
        let k = min(rect.width, rect.height) / 24
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * k, y: rect.minY + y * k)
        }
        var path = Path()
        path.move(to: p(21, 16))
        path.addLine(to: p(21, 14))
        path.addLine(to: p(13, 9))
        path.addLine(to: p(13, 3.5))
        path.addCurve(to: p(11.5, 2), control1: p(13, 2.67), control2: p(12.33, 2))
        path.addCurve(to: p(10, 3.5), control1: p(10.67, 2), control2: p(10, 2.67))
        path.addLine(to: p(10, 9))
        path.addLine(to: p(2, 14))
        path.addLine(to: p(2, 16))
        path.addLine(to: p(10, 13.5))
        path.addLine(to: p(10, 19))
        path.addLine(to: p(8, 20.5))
        path.addLine(to: p(8, 22))
        path.addLine(to: p(11.5, 21))
        path.addLine(to: p(15, 22))
        path.addLine(to: p(15, 20.5))
        path.addLine(to: p(13, 19))
        path.addLine(to: p(13, 13.5))
        path.addLine(to: p(21, 16))
        path.closeSubpath()
        return path
    }
}

private struct ChipView: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Brand.whiteFaint, in: Capsule())
    }
}

/// Thin progress track with the plane riding the fill edge — for the
/// Dynamic Island's bottom region and the watch tile, where there's no route
/// row to carry the plane. Flight progress: the plane sits at the start
/// until departure (no fake sliver — the plane itself says it's alive).
private struct ContrailProgress: View {
    let progress: Double
    let delayed: Bool

    private let planeSize: CGFloat = 11

    var body: some View {
        GeometryReader { geo in
            let travel = max(0, geo.size.width - planeSize)
            let x = travel * progress
            ZStack(alignment: .leading) {
                Capsule().fill(Brand.whiteFaint).frame(height: 4)
                Capsule()
                    .fill(delayed ? Brand.amber : Brand.cobalt)
                    .frame(width: x + planeSize / 2, height: 4)
                Image(systemName: "airplane")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(Brand.white)
                    .frame(width: planeSize, height: planeSize)
                    .offset(x: x)
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .leading)
        }
        .frame(height: 12)
    }
}
