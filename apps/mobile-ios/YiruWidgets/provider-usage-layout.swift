import SwiftUI
import WidgetKit

struct ProviderUsageWidgetView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.widgetFamily) private var widgetFamily
    let entry: ProviderUsageEntry

    var body: some View {
        layout
            .containerBackground(backgroundColor, for: .widget)
            .widgetURL(entry.provider?.openURL ?? YiruWidgetPresentation.fallbackURL)
            .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var layout: some View {
        switch widgetFamily {
        case .systemSmall:
            SmallProviderUsageView(
                providerName: providerName,
                quota: sessionQuota
            )
        case .systemMedium:
            MediumProviderUsageView(
                providerName: providerName,
                updatedAt: entry.provider?.updatedAt,
                weeklyQuota: weeklyQuota,
                sessionQuota: sessionQuota
            )
        default:
            SmallProviderUsageView(
                providerName: providerName,
                quota: sessionQuota
            )
        }
    }

    private var providerName: String {
        entry.provider?.name ?? (entry.isClaude ? "Claude" : "ChatGPT")
    }

    private var weeklyQuota: ProviderQuotaPresentation {
        ProviderQuotaPresentation(
            label: "Weekly",
            usedPercent: entry.provider?.weeklyUsedPercent,
            color: primaryColor
        )
    }

    private var sessionQuota: ProviderQuotaPresentation {
        ProviderQuotaPresentation(
            label: "5h",
            usedPercent: entry.provider?.sessionUsedPercent,
            color: secondaryColor
        )
    }

    private var backgroundColor: Color {
        if entry.isClaude { return Color(widgetHex: colorScheme == .dark ? 0x8F432B : 0xC96843) }
        return Color(widgetHex: colorScheme == .dark ? 0x1C1C1E : 0xF7F7F5)
    }

    private var primaryColor: Color {
        entry.isClaude || colorScheme == .dark ? .white : Color(widgetHex: 0x0A0A0A)
    }

    private var secondaryColor: Color {
        if entry.isClaude { return Color(widgetHex: 0xFFD8A8) }
        return Color(widgetHex: colorScheme == .dark ? 0xB8B8BD : 0x65656A)
    }
}

private struct ProviderQuotaPresentation {
    let label: LocalizedStringResource
    let usedPercent: Double?
    let color: Color

    var progress: Double {
        (remainingPercent ?? 0) / 100
    }

    var percentLabel: String {
        guard let remainingPercent else { return "—" }
        return "\(Int(remainingPercent.rounded()))%"
    }

    private var remainingPercent: Double? {
        guard let usedPercent else { return nil }
        return 100 - min(100, max(0, usedPercent))
    }
}

private struct SmallProviderUsageView: View {
    let providerName: String
    let quota: ProviderQuotaPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(providerName)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(quota.color)
                .lineLimit(1)
                .frame(height: 12, alignment: .leading)
            quotaDots(quota, columns: 13, rows: 8)
                .frame(height: 94)
            HStack(alignment: .bottom, spacing: 7) {
                quotaPercent(quota, size: 28)
                VStack(alignment: .leading, spacing: 1) {
                    Text(quota.label)
                        .font(.system(size: 9, weight: .bold))
                        .lineLimit(1)
                    Text("remaining")
                        .font(.system(size: 8, weight: .semibold))
                        .lineLimit(1)
                }
                .foregroundStyle(quota.color)
            }
            .frame(height: 32, alignment: .bottom)
        }
        .padding(6)
    }
}

private struct MediumProviderUsageView: View {
    let providerName: String
    let updatedAt: Date?
    let weeklyQuota: ProviderQuotaPresentation
    let sessionQuota: ProviderQuotaPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            providerHeader(
                providerName: providerName, updatedAt: updatedAt, color: weeklyQuota.color
            )
            .frame(height: 12)
            HStack(spacing: 6) {
                quotaDots(weeklyQuota, columns: 13, rows: 8)
                quotaDots(sessionQuota, columns: 13, rows: 8)
            }
            .frame(height: 99)
            HStack(spacing: 6) {
                MediumQuotaLabel(quota: weeklyQuota)
                MediumQuotaLabel(quota: sessionQuota)
            }
            .frame(height: 27)
        }
        .padding(6)
    }
}

private struct MediumQuotaLabel: View {
    let quota: ProviderQuotaPresentation

    var body: some View {
        HStack(alignment: .bottom, spacing: 5) {
            quotaPercent(quota, size: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(quota.label)
                    .font(.system(size: 8, weight: .bold))
                    .lineLimit(1)
                Text("remaining")
                    .font(.system(size: 7, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(quota.color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private func providerHeader(
    providerName: String,
    updatedAt: Date?,
    color: Color
) -> some View {
    HStack(spacing: 6) {
        Text(providerName)
            .font(.system(size: 10, weight: .bold))
            .lineLimit(1)
        Spacer()
        HStack(spacing: 4) {
            YiruIcon(.refresh, size: 9)
            Text(YiruWidgetPresentation.age(from: updatedAt, now: .now))
                .font(.system(size: 9, weight: .semibold))
                .monospacedDigit()
                .lineLimit(1)
        }
    }
    .foregroundStyle(color)
}

private func quotaDots(
    _ quota: ProviderQuotaPresentation,
    columns: Int,
    rows: Int
) -> some View {
    YiruDotProgress(
        progress: quota.progress,
        activeColor: quota.color,
        inactiveColor: quota.color.opacity(0.14),
        columns: columns,
        rows: rows
    )
    // Why: quota dots are the widget's semantic foreground and must stay legible in Tinted mode.
    .widgetAccentable()
}

private func quotaPercent(
    _ quota: ProviderQuotaPresentation,
    size: CGFloat
) -> some View {
    Text(quota.percentLabel)
        .font(.system(size: size, weight: .bold))
        .foregroundStyle(quota.color)
        .monospacedDigit()
        .tracking(-0.8)
        .minimumScaleFactor(0.6)
        .lineLimit(1)
}
