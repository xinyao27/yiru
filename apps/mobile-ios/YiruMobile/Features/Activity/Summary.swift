import Foundation

nonisolated enum ActivityUsageRange: String, CaseIterable, Codable, Sendable {
    case sevenDays = "7d"
    case thirtyDays = "30d"
    case ninetyDays = "90d"

    var title: LocalizedStringResource {
        switch self {
        case .sevenDays: "7 days"
        case .thirtyDays: "30 days"
        case .ninetyDays: "90 days"
        }
    }

    var wire: MobileStatsRangeWire {
        switch self {
        case .sevenDays: .sevenDays
        case .thirtyDays: .thirtyDays
        case .ninetyDays: .ninetyDays
        }
    }
}

nonisolated enum ActivityMetric: String, CaseIterable, Hashable, Sendable {
    case activity
    case tokens
    case value

    var title: LocalizedStringResource {
        switch self {
        case .activity: "Activity"
        case .tokens: "Tokens"
        case .value: "API value"
        }
    }
}

nonisolated struct ActivityDailyPoint: Codable, Hashable, Identifiable, Sendable {
    let day: String
    let activity: Double
    let tokens: Double
    let valueUSD: Double?
    var id: String { day }
}

nonisolated struct ActivityProviderUsage: Codable, Hashable, Identifiable, Sendable {
    let provider: String
    let tokens: Double
    let valueUSD: Double?
    var id: String { provider }
}

nonisolated struct ActivityDailyProviderUsage: Codable, Hashable, Identifiable, Sendable {
    let day: String
    let providers: [ActivityProviderUsage]
    var id: String { day }
}

nonisolated struct ActivityBreakdown: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let label: String
    let sessions: Double?
    let tokens: Double
    let valueUSD: Double?
    let providers: [ActivityProviderUsage]
}

// Why: the supplemental payload also carries per-day and per-model token series,
// but `daily`/`models` above already feed every chart and breakdown, so only the
// metered value is kept — decoding older cached snapshots simply ignores the rest.
nonisolated struct ActivitySupplementalUsage: Codable, Hashable, Sendable {
    let meteredValueUSD: Double?
}

nonisolated struct ActivityStatsSummary: Codable, Hashable, Sendable {
    let totalAgentsSpawned: Double
    let totalPRsCreated: Double
    let totalAgentTimeMS: Double
    let firstEventAt: Double?
    let daily: [ActivityDailyPoint]
    let dailyProviders: [ActivityDailyProviderUsage]
    let models: [ActivityBreakdown]
    let projects: [ActivityBreakdown]
    let usageRange: String?
    let hasUsageValue: Bool
    let hasUnpricedUsage: Bool
    let tokenDataAvailable: Bool?
    let tokenUnavailableAgents: [String]?
    let supplementalUsage: ActivitySupplementalUsage?

    init(
        totalAgentsSpawned: Double,
        totalPRsCreated: Double,
        totalAgentTimeMS: Double,
        firstEventAt: Double?,
        daily: [ActivityDailyPoint],
        dailyProviders: [ActivityDailyProviderUsage],
        models: [ActivityBreakdown],
        projects: [ActivityBreakdown],
        usageRange: String?,
        hasUsageValue: Bool,
        hasUnpricedUsage: Bool,
        tokenDataAvailable: Bool? = nil,
        tokenUnavailableAgents: [String]? = nil,
        supplementalUsage: ActivitySupplementalUsage? = nil
    ) {
        self.totalAgentsSpawned = totalAgentsSpawned
        self.totalPRsCreated = totalPRsCreated
        self.totalAgentTimeMS = totalAgentTimeMS
        self.firstEventAt = firstEventAt
        self.daily = daily
        self.dailyProviders = dailyProviders
        self.models = models
        self.projects = projects
        self.usageRange = usageRange
        self.hasUsageValue = hasUsageValue
        self.hasUnpricedUsage = hasUnpricedUsage
        self.tokenDataAvailable = tokenDataAvailable
        self.tokenUnavailableAgents = tokenUnavailableAgents
        self.supplementalUsage = supplementalUsage
    }

    static func aggregate(_ summaries: [ActivityStatsSummary]) -> ActivityStatsSummary? {
        guard !summaries.isEmpty else { return nil }
        let daily = mergeDaily(summaries.flatMap(\.daily))
        return ActivityStatsSummary(
            totalAgentsSpawned: summaries.reduce(0) { $0 + $1.totalAgentsSpawned },
            totalPRsCreated: summaries.reduce(0) { $0 + $1.totalPRsCreated },
            totalAgentTimeMS: summaries.reduce(0) { $0 + $1.totalAgentTimeMS },
            firstEventAt: summaries.compactMap(\.firstEventAt).min(),
            daily: daily,
            dailyProviders: mergeDailyProviders(summaries.flatMap(\.dailyProviders)),
            models: mergeBreakdowns(summaries.flatMap(\.models)),
            projects: mergeBreakdowns(summaries.flatMap(\.projects)),
            usageRange: sharedRange(summaries),
            hasUsageValue: summaries.contains { $0.hasUsageValue },
            hasUnpricedUsage: summaries.contains { $0.hasUnpricedUsage },
            tokenDataAvailable: summaries.allSatisfy { $0.tokenDataAvailable == true },
            tokenUnavailableAgents: Array(
                Set(summaries.flatMap { $0.tokenUnavailableAgents ?? [] })
            ).sorted(),
            supplementalUsage: mergeSupplementalUsage(summaries.compactMap(\.supplementalUsage))
        )
    }
}

nonisolated private func mergeDaily(_ values: [ActivityDailyPoint]) -> [ActivityDailyPoint] {
    let grouped = Dictionary(grouping: values, by: \.day)
    var output: [ActivityDailyPoint] = []
    for (day, points) in grouped {
        let activity = points.reduce(0) { $0 + $1.activity }
        let tokens = points.reduce(0) { $0 + $1.tokens }
        let value =
            points.contains { $0.valueUSD == nil }
            ? nil : points.compactMap(\.valueUSD).reduce(0, +)
        output.append(
            ActivityDailyPoint(day: day, activity: activity, tokens: tokens, valueUSD: value)
        )
    }
    return output.sorted { $0.day < $1.day }
}

nonisolated private func mergeDailyProviders(_ values: [ActivityDailyProviderUsage])
    -> [ActivityDailyProviderUsage]
{
    Dictionary(grouping: values, by: \.day).map { day, entries in
        ActivityDailyProviderUsage(
            day: day,
            providers: mergeProviders(entries.flatMap(\.providers))
        )
    }.sorted { $0.day < $1.day }
}

nonisolated private func mergeBreakdowns(_ values: [ActivityBreakdown]) -> [ActivityBreakdown] {
    let grouped = Dictionary(grouping: values, by: breakdownKey)
    var output: [ActivityBreakdown] = []
    for (id, entries) in grouped {
        let sessionValues = entries.compactMap(\.sessions)
        let sessions = sessionValues.isEmpty ? nil : sessionValues.reduce(0, +)
        let tokens = entries.reduce(0) { $0 + $1.tokens }
        let value =
            entries.contains { $0.valueUSD == nil }
            ? nil : entries.compactMap(\.valueUSD).reduce(0, +)
        output.append(
            ActivityBreakdown(
                id: id,
                label: entries.first?.label ?? id,
                sessions: sessions,
                tokens: tokens,
                valueUSD: value,
                providers: mergeProviders(entries.flatMap(\.providers))
            )
        )
    }
    return output.sorted { $0.tokens > $1.tokens }
}

nonisolated private func breakdownKey(_ value: ActivityBreakdown) -> String {
    let key = value.id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if !key.isEmpty { return key }
    return value.label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
}

nonisolated private func mergeSupplementalUsage(
    _ values: [ActivitySupplementalUsage]
) -> ActivitySupplementalUsage? {
    guard !values.isEmpty else { return nil }
    let meteredValues = values.map(\.meteredValueUSD)
    let meteredValueUSD =
        meteredValues.allSatisfy { $0 != nil }
        ? meteredValues.compactMap { $0 }.reduce(0, +)
        : nil
    return ActivitySupplementalUsage(meteredValueUSD: meteredValueUSD)
}

nonisolated private func mergeProviders(_ values: [ActivityProviderUsage])
    -> [ActivityProviderUsage]
{
    Dictionary(grouping: values, by: \.provider).map { provider, entries in
        ActivityProviderUsage(
            provider: provider,
            tokens: entries.reduce(0) { $0 + $1.tokens },
            valueUSD: entries.contains { $0.valueUSD == nil }
                ? nil : entries.compactMap(\.valueUSD).reduce(0, +)
        )
    }.sorted { providerOrder($0.provider) < providerOrder($1.provider) }
}

nonisolated private func providerOrder(_ value: String) -> Int {
    ["claude", "codex", "open-code"].firstIndex(of: value) ?? 3
}

nonisolated private func sharedRange(_ summaries: [ActivityStatsSummary]) -> String? {
    guard let first = summaries.first?.usageRange,
        summaries.dropFirst().allSatisfy({ $0.usageRange == first })
    else { return nil }
    return first
}
