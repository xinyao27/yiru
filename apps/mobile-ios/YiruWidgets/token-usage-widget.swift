import SwiftUI
import WidgetKit

struct TokenUsageEntry: TimelineEntry {
    let date: Date
    let savedAt: Date?
    let snapshot: TokenWidgetSnapshot?
}

struct TokenUsageTimelineProvider: TimelineProvider {
    func placeholder(in _: Context) -> TokenUsageEntry {
        TokenUsageEntry(date: .now, savedAt: nil, snapshot: nil)
    }

    func getSnapshot(in _: Context, completion: @escaping (TokenUsageEntry) -> Void) {
        completion(entry())
    }

    func getTimeline(in _: Context, completion: @escaping (Timeline<TokenUsageEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .after(.now + 15 * 60)))
    }

    private func entry() -> TokenUsageEntry {
        let stored = YiruWidgetSnapshotStore.load()
        return TokenUsageEntry(date: .now, savedAt: stored?.savedAt, snapshot: stored?.tokens)
    }
}

struct TokenUsageWidgetView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.widgetFamily) private var widgetFamily
    let entry: TokenUsageEntry

    var body: some View {
        layout
            .containerBackground(backgroundColor, for: .widget)
            .widgetURL(entry.snapshot?.openURL ?? YiruWidgetPresentation.fallbackURL)
            .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var layout: some View {
        switch widgetFamily {
        case .systemSmall:
            SmallTokenUsageView(
                savedAt: entry.savedAt,
                snapshot: entry.snapshot,
                todayShare: todayShare
            )
        case .systemMedium:
            MediumTokenUsageView(
                savedAt: entry.savedAt,
                snapshot: entry.snapshot,
                todayShare: todayShare
            )
        default:
            SmallTokenUsageView(
                savedAt: entry.savedAt,
                snapshot: entry.snapshot,
                todayShare: todayShare
            )
        }
    }

    private var todayShare: Double {
        guard let snapshot = entry.snapshot, snapshot.weekTokens > 0 else { return 0 }
        return min(1, max(0, snapshot.todayTokens / snapshot.weekTokens))
    }

    private var backgroundColor: Color {
        Color(widgetHex: colorScheme == .dark ? 0x8F432B : 0xC96843)
    }
}

private struct SmallTokenUsageView: View {
    let savedAt: Date?
    let snapshot: TokenWidgetSnapshot?
    let todayShare: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            tokenHeader(savedAt: savedAt)
                .frame(height: 12)
            HStack(spacing: 10) {
                TokenShareRing(progress: todayShare, size: 60, lineWidth: 8, labelSize: nil)
                TokenMetric(
                    label: "Today",
                    tokens: snapshot?.todayTokens ?? 0,
                    valueUSD: snapshot?.todayValueUSD ?? 0,
                    valueSize: 27,
                    color: .white
                )
            }
            .frame(height: 70)
            Spacer(minLength: 0)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(YiruWidgetPresentation.tokenCount(snapshot?.weekTokens ?? 0))
                        .font(.system(size: 17, weight: .bold))
                        .monospacedDigit()
                        .lineLimit(1)
                    Text("Week")
                        .font(.system(size: 8, weight: .bold))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(YiruWidgetPresentation.currency(snapshot?.weekValueUSD ?? 0))
                    .font(.system(size: 10, weight: .bold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .foregroundStyle(Color(widgetHex: 0xFFD8A8))
            .frame(height: 28)
        }
        .padding(12)
    }
}

private struct MediumTokenUsageView: View {
    let savedAt: Date?
    let snapshot: TokenWidgetSnapshot?
    let todayShare: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            tokenHeader(savedAt: savedAt)
                .frame(height: 12)
            HStack(spacing: 16) {
                TokenShareRing(progress: todayShare, size: 96, lineWidth: 10, labelSize: 17)
                TokenMetric(
                    label: "Today",
                    tokens: snapshot?.todayTokens ?? 0,
                    valueUSD: snapshot?.todayValueUSD ?? 0,
                    valueSize: 28,
                    color: .white
                )
                TokenMetric(
                    label: "Week",
                    tokens: snapshot?.weekTokens ?? 0,
                    valueUSD: snapshot?.weekValueUSD ?? 0,
                    valueSize: 28,
                    color: Color(widgetHex: 0xFFD8A8)
                )
            }
            .frame(maxHeight: .infinity)
        }
        .padding(14)
    }
}

private struct TokenMetric: View {
    let label: LocalizedStringResource
    let tokens: Double
    let valueUSD: Double
    let valueSize: CGFloat
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(YiruWidgetPresentation.tokenCount(tokens))
                .font(.system(size: valueSize, weight: .bold))
                .monospacedDigit()
                .tracking(-0.8)
                .minimumScaleFactor(0.55)
                .lineLimit(1)
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .lineLimit(1)
            Text(YiruWidgetPresentation.currency(valueUSD))
                .font(.system(size: 11, weight: .bold))
                .monospacedDigit()
                .minimumScaleFactor(0.7)
                .lineLimit(1)
        }
        .foregroundStyle(color)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct TokenShareRing: View {
    let progress: Double
    let size: CGFloat
    let lineWidth: CGFloat
    let labelSize: CGFloat?

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.2), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    Color.white,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .widgetAccentable()
            if let labelSize {
                VStack(spacing: 1) {
                    Text("\(Int((progress * 100).rounded()))%")
                        .font(.system(size: labelSize, weight: .bold))
                        .monospacedDigit()
                    Text("Today")
                        .font(.system(size: max(8, labelSize * 0.3), weight: .semibold))
                }
                .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

private func tokenHeader(savedAt: Date?) -> some View {
    HStack(spacing: 6) {
        Text("Token usage")
            .font(.system(size: 10, weight: .bold))
            .lineLimit(1)
        Spacer()
        HStack(spacing: 4) {
            YiruIcon(.refresh, size: 9)
            Text(YiruWidgetPresentation.age(from: savedAt, now: .now))
                .font(.system(size: 9, weight: .semibold))
                .monospacedDigit()
                .lineLimit(1)
        }
    }
    .foregroundStyle(.white)
}

struct TokenUsageWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TokenUsageWidget", provider: TokenUsageTimelineProvider()) {
            TokenUsageWidgetView(entry: $0)
        }
        .configurationDisplayName("Token Usage")
        .description("Shows cumulative token usage for today and this week.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}
