import Foundation

nonisolated func activityMetricValue(
    _ metric: ActivityMetric,
    daily: ActivityDailyPoint
) -> Double {
    switch metric {
    case .activity: daily.activity
    case .tokens: daily.tokens
    case .value: daily.valueUSD ?? 0
    }
}

nonisolated func activityMetricValue(
    _ metric: ActivityMetric,
    breakdown: ActivityBreakdown
) -> Double? {
    switch metric {
    case .activity: breakdown.sessions
    case .tokens: breakdown.tokens
    case .value: breakdown.valueUSD
    }
}

nonisolated func formatActivityMetric(_ value: Double, metric: ActivityMetric) -> String {
    switch metric {
    case .activity:
        return value.formatted(.number.precision(.fractionLength(0)))
    case .tokens:
        if value >= 1_000_000 {
            return "\((value / 1_000_000).formatted(.number.precision(.fractionLength(1))))M"
        }
        if value >= 1_000 {
            return "\((value / 1_000).formatted(.number.precision(.fractionLength(1))))K"
        }
        return value.formatted(.number.precision(.fractionLength(0)))
    case .value:
        return value.formatted(.currency(code: "USD").precision(.fractionLength(2)))
    }
}

nonisolated func formatAgentDuration(_ milliseconds: Double) -> String {
    let minutes = Int(milliseconds / 60_000)
    let hours = minutes / 60
    let days = hours / 24
    if days > 0 { return "\(days)d \(hours % 24)h" }
    if hours > 0 { return "\(hours)h \(minutes % 60)m" }
    return "\(minutes)m"
}

// Why: tapping any contribution chart cycles Tokens -> API value -> Tokens, and lands on
// Tokens from every other state — including the Activity segment, which has no chart-tap
// entry point of its own.
nonisolated func nextTokenValueMetric(_ metric: ActivityMetric) -> ActivityMetric {
    metric == .tokens ? .value : .tokens
}

nonisolated func activityProviderLabel(_ provider: String) -> String {
    switch provider {
    case "claude": "Claude"
    case "codex": "Codex"
    case "open-code": "OpenCode"
    default: provider
    }
}

nonisolated func activityProviderOpacity(_ provider: String) -> Double {
    switch provider {
    case "claude": 1
    case "codex": 0.66
    case "open-code": 0.38
    default: 0.5
    }
}
