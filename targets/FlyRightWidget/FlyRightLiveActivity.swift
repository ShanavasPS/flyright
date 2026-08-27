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
//   attributes: journeyId, title
//   state: subtitle, progress (0…1), stageLabel, compactLabel, gate,
//          terminal, delayLabel, emphasis ("none" | "delay" | "gate")

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
    let subtitle: String
    let progress: Double
    let stageLabel: String?
    let compactLabel: String?
    let gate: String?
    let terminal: String?
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
        subtitle = text(context.state.data["subtitle"]?.asString()) ?? "Following your trip"
        progress = min(1, max(0, context.state.data["progress"]?.asDouble() ?? 0))
        stageLabel = text(context.state.data["stageLabel"]?.asString())
        compactLabel = text(context.state.data["compactLabel"]?.asString())
        gate = text(context.state.data["gate"]?.asString())
        terminal = text(context.state.data["terminal"]?.asString())
        delayLabel = text(context.state.data["delayLabel"]?.asString())
        delayed = context.state.data["emphasis"]?.asString() == "delay"
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
                    Text(model.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.white)
                        .lineLimit(1)
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

/// The lock-screen card: route title, stage/countdown line, contrail
/// progress, gate/terminal chips — the same hierarchy as the in-app banner.
private struct LockScreenView: View {
    let model: TravelDayModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("TRAVEL DAY")
                    .font(.caption2.weight(.bold))
                    .kerning(1.2)
                    .foregroundStyle(Brand.whiteDim)
                Spacer()
                if let delay = model.delayLabel {
                    ChipView(text: delay, color: Brand.amber)
                }
            }

            Text(model.title)
                .font(.headline)
                .foregroundStyle(Brand.white)
                .lineLimit(1)

            Text(model.subtitle)
                .font(.footnote)
                .foregroundStyle(Brand.whiteDim)
                .lineLimit(1)

            ContrailProgress(progress: model.progress, delayed: model.delayed)

            if model.gate != nil || model.terminal != nil {
                HStack(spacing: 6) {
                    if let gate = model.gate {
                        ChipView(text: "Gate \(gate)", color: Brand.cobalt)
                    }
                    if let terminal = model.terminal {
                        ChipView(text: "Terminal \(terminal)", color: Brand.cobalt)
                    }
                }
                // The contrail's plane glyph overflows its 5pt track, visually
                // eating the stack gap — give the chips extra clearance.
                .padding(.top, 6)
            }
        }
        .padding(16)
        .activityBackgroundTint(Brand.navy)
        .activitySystemActionForegroundColor(Brand.white)
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

/// Thin progress track with a plane riding the fill edge — the widget-scale
/// echo of the brand's contrail motif. Never fully empty so it reads alive.
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
