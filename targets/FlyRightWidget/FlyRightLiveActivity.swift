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
//   state: subtitle, progress (0…1), stageLabel, compactLabel, gate,
//          terminal, delayLabel, emphasis ("none" | "delay" | "gate"),
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

    /// "LH873" → "LH": the two-character IATA designator, mirroring the
    /// regex in src/components/airline-logo.tsx#airlineCode. Nil for manual
    /// rows whose flightLabel is a carrier name — the chip simply hides.
    var airlineCode: String? {
        guard let flight = flightLabel?.uppercased() else { return nil }
        let chars = Array(flight)
        guard chars.count >= 3 else { return nil }
        let a = chars[0], b = chars[1]
        let pairOK = (a.isLetter && b.isLetter)
            || (a.isLetter && b.isNumber)
            || (a.isNumber && b.isLetter)
        guard pairOK else { return nil }
        let next = chars[2] == " " ? (chars.count >= 4 ? chars[3] : nil) : chars[2]
        guard let next, next.isNumber else { return nil }
        return String([a, b])
    }

    var deepLink: URL? {
        URL(string: "flyright://journey/\(journeyId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? journeyId)")
    }
}

struct OneSignalWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DefaultLiveActivityAttributes.self) { context in
            LockScreenView(model: TravelDayModel(context: context))
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
                    VStack(alignment: .leading, spacing: 6) {
                        Text(model.subtitle)
                            .font(.footnote)
                            .foregroundStyle(Brand.whiteDim)
                            .lineLimit(1)
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

/// The lock-screen card, boarding-pass style — the same hierarchy as the
/// in-app travel-day hero: airline chip + label header, big route codes
/// joined by a dotted path with the plane at its middle, stage/countdown
/// line, slim progress track, then flight/gate/terminal facts.
private struct LockScreenView: View {
    let model: TravelDayModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                if let code = model.airlineCode {
                    MonogramChip(code: code)
                }
                Text("TRAVEL DAY")
                    .font(.caption2.weight(.bold))
                    .kerning(1.2)
                    .foregroundStyle(Brand.whiteDim)
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

            ProgressTrack(progress: model.progress, delayed: model.delayed)

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
/// a dotted contrail between them with the plane at its middle.
private struct RouteRow: View {
    let from: String
    let to: String
    let depTime: String?
    let arrTime: String?
    let delayed: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            endpoint(code: from, time: depTime, alignment: .leading)
            // Top-aligned so the path meets the codes' midline instead of
            // sagging toward the time row beneath them.
            RoutePath(delayed: delayed)
                .padding(.top, 10)
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

/// Endpoint dots and a dotted line with the brand plane mid-route.
private struct RoutePath: View {
    let delayed: Bool

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(Brand.whiteDim).frame(width: 3, height: 3)
            dottedLine
            Image(systemName: "airplane")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(delayed ? Brand.amber : Brand.cobalt)
            dottedLine
            Circle().fill(Brand.whiteDim).frame(width: 3, height: 3)
        }
        .frame(maxWidth: .infinity)
    }

    private var dottedLine: some View {
        HorizontalLine()
            .stroke(
                Brand.white.opacity(0.35),
                style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [0.1, 5])
            )
            .frame(height: 2)
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

/// Widget-scale stand-in for the app's white airline-logo chip — Live
/// Activities can't fetch remote images, so the IATA monogram wears the chip.
private struct MonogramChip: View {
    let code: String

    var body: some View {
        Text(code)
            .font(.system(size: 9, weight: .heavy, design: .rounded))
            .foregroundStyle(Brand.navy)
            .frame(width: 20, height: 20)
            .background(Brand.white, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
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

/// Slim stage-progress capsule under the route — the plane already flies the
/// dotted path above, so the track stays clean (matches the in-app hero).
private struct ProgressTrack: View {
    let progress: Double
    let delayed: Bool

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Brand.whiteFaint)
                Capsule()
                    .fill(delayed ? Brand.amber : Brand.cobalt)
                    // Never fully empty — a sliver shows it's alive.
                    .frame(width: max(0.04, progress) * geo.size.width)
            }
        }
        .frame(height: 4)
    }
}

/// Thin progress track with a plane riding the fill edge — kept for the
/// Dynamic Island's bottom region, where there's no route row to carry the
/// plane. Never fully empty so it reads alive.
private struct ContrailProgress: View {
    let progress: Double
    let delayed: Bool

    var body: some View {
        GeometryReader { geo in
            let fill = max(0.04, progress) * geo.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(Brand.whiteFaint)
                Capsule()
                    .fill(delayed ? Brand.amber : Brand.cobalt)
                    .frame(width: fill)
                Image(systemName: "airplane")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(Brand.white)
                    .offset(x: max(0, fill - 11))
            }
        }
        .frame(height: 5)
    }
}
