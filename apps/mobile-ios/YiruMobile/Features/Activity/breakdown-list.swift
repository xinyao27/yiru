import SwiftUI

struct ActivityBreakdownList: View {
    let title: LocalizedStringResource
    let metric: ActivityMetric
    let values: [ActivityBreakdown]
    var showsSearch = false
    @State private var query = ""
    @State private var isExpanded = false

    var body: some View {
        let matchingValues = matchingValues
        let visibleValues =
            isExpanded || !query.isEmpty ? matchingValues : Array(matchingValues.prefix(6))
        let canToggle = query.isEmpty && (matchingValues.count > 6 || isExpanded)

        ContentSurface {
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                Text(summary)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .padding(.top, 4)
                if showsSearch, values.count > 6 {
                    TextField("Filter projects", text: $query)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 40)
                        .glassEffect(.regular.interactive(), in: .capsule)
                        .padding(.top, 12)
                }
                ForEach(Array(visibleValues.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { Divider() }
                    row(item)
                }
                if canToggle {
                    Button(isExpanded ? "Show less" : "Show all \(matchingValues.count) projects") {
                        isExpanded.toggle()
                    }
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.Colors.foreground)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .buttonStyle(.plain)
                }
                if metric == .value, values.contains(where: { $0.valueUSD == nil }) {
                    Text("Usage without authoritative pricing is shown without a combined value.")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .padding(.top, 8)
                }
            }
            .padding(16)
        }
    }

    private var matchingValues: [ActivityBreakdown] {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let matched =
            normalized.isEmpty
            ? values
            : values.filter { $0.label.localizedCaseInsensitiveContains(normalized) }
        return matched.sorted {
            (activityMetricValue(metric, breakdown: $0) ?? 0)
                > (activityMetricValue(metric, breakdown: $1) ?? 0)
        }
    }

    private var summary: String {
        let tokens = values.reduce(0) { $0 + $1.tokens }
        if showsSearch {
            let sessions = values.compactMap(\.sessions).reduce(0, +)
            return
                "\(formatActivityMetric(tokens, metric: .tokens)) · \(values.count) projects · \(Int(sessions)) sessions"
        }
        return "\(values.count) models · \(formatActivityMetric(tokens, metric: .tokens))"
    }

    private func row(_ item: ActivityBreakdown) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(item.label)
                    .font(.system(size: 14, weight: .medium))
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text(valueLabel(item))
                    .font(.system(size: 14, weight: .semibold))
                    .monospacedDigit()
            }
            if let sessions = item.sessions {
                Text(
                    "\(formatActivityMetric(item.tokens, metric: .tokens)) · \(Int(sessions)) sessions"
                )
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.mutedForeground)
            }
            if !item.providers.isEmpty { providerBar(item.providers) }
        }
        .padding(.vertical, 12)
    }

    private func valueLabel(_ item: ActivityBreakdown) -> String {
        guard let value = activityMetricValue(metric, breakdown: item) else { return "—" }
        return formatActivityMetric(value, metric: metric)
    }

    private func providerBar(_ providers: [ActivityProviderUsage]) -> some View {
        let total = providers.reduce(0) { $0 + ($1.tokens) }
        return GeometryReader { geometry in
            HStack(spacing: 0) {
                ForEach(providers) { provider in
                    Rectangle()
                        .fill(
                            Theme.Colors.mutedForeground.opacity(
                                activityProviderOpacity(provider.provider))
                        )
                        .frame(width: total > 0 ? geometry.size.width * provider.tokens / total : 0)
                }
            }
        }
        .frame(height: 4)
        .background(Theme.Colors.selection.opacity(0.5))
    }
}
