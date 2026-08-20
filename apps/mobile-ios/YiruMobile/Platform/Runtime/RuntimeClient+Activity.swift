import Foundation

extension RuntimeClient: ActivityStatsRepository {
    func activityStats(
        for hostID: String,
        range: ActivityUsageRange,
        refreshUsage: Bool
    ) async throws -> ActivityStatsSummary? {
        let wire: MobileStatsSummaryWire = try await callRuntime(
            hostID: hostID,
            path: MobileStatsWireContract.summaryPath,
            input: MobileStatsSummaryRequestWire(
                refreshUsage: refreshUsage,
                range: range.wire
            ),
            output: MobileStatsSummaryWire.self
        )
        guard let agents = wire.totalAgentsSpawned,
            let prs = wire.totalPRsCreated,
            let time = wire.totalAgentTimeMs
        else { return nil }
        let activities = (wire.dailyActivity ?? []).reduce(into: [String: Double]()) {
            $0[$1.day, default: 0] += $1.agentStarts + $1.prsCreated
        }
        let tokens = (wire.dailyTokens ?? []).reduce(into: [String: Double]()) {
            $0[$1.day, default: 0] += $1.tokens
        }
        let values = (wire.dailyValues ?? []).reduce(into: [String: Double]()) {
            $0[$1.day, default: 0] += $1.valueUsd
        }
        let unpricedDays = Set(
            (wire.dailyUnpricedTokens ?? []).filter { $0.tokens > 0 }.map(\.day)
        )
        let days = Set(activities.keys).union(tokens.keys).union(values.keys)
        return ActivityStatsSummary(
            totalAgentsSpawned: agents,
            totalPRsCreated: prs,
            totalAgentTimeMS: time,
            firstEventAt: wire.firstEventAt,
            daily: days.map { day in
                ActivityDailyPoint(
                    day: day,
                    activity: activities[day] ?? 0,
                    tokens: tokens[day] ?? 0,
                    valueUSD: unpricedDays.contains(day) ? nil : values[day]
                )
            }.sorted { $0.day < $1.day },
            dailyProviders: (wire.dailyProviderUsage ?? []).map {
                ActivityDailyProviderUsage(
                    day: $0.day,
                    providers: $0.providers.map(mapActivityProvider)
                )
            },
            models: (wire.modelUsage ?? []).map {
                ActivityBreakdown(
                    id: $0.key,
                    label: $0.label,
                    sessions: nil,
                    tokens: $0.tokens,
                    valueUSD: $0.valueUsd,
                    providers: []
                )
            },
            projects: (wire.projectUsage ?? []).map {
                ActivityBreakdown(
                    id: $0.key,
                    label: $0.label,
                    sessions: $0.sessions,
                    tokens: $0.tokens,
                    valueUSD: $0.valueUsd,
                    providers: $0.providers.map(mapActivityProvider)
                )
            },
            usageRange: wire.usageRange,
            hasUsageValue: wire.usageValueAvailable == true,
            hasUnpricedUsage: wire.hasUnpricedUsage == true,
            tokenDataAvailable: wire.tokenDataAvailable,
            tokenUnavailableAgents: wire.tokenUnavailableAgents,
            supplementalUsage: wire.supplementalUsage.map(mapSupplementalUsage)
        )
    }
}

nonisolated private func mapActivityProvider(_ wire: MobileStatsProviderUsageWire)
    -> ActivityProviderUsage
{
    ActivityProviderUsage(
        provider: wire.provider,
        tokens: wire.tokens,
        valueUSD: wire.valueUsd
    )
}

nonisolated private func mapSupplementalUsage(
    _ wire: MobileStatsSupplementalUsageWire
) -> ActivitySupplementalUsage {
    ActivitySupplementalUsage(meteredValueUSD: wire.meteredValueUsd)
}
