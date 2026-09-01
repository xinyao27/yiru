#if DEBUG
    import Foundation
    import SwiftUI

    enum HomeFixtureScenario: Sendable {
        case dashboard
        case onboarding
    }

    struct HomeFixtureView: View {
        let scenario: HomeFixtureScenario
        private let repository: HomeFixtureRepository
        private let creationRepository = WorkspaceListFixtureRepository()
        private let defaults: UserDefaults

        init(scenario: HomeFixtureScenario) {
            self.scenario = scenario
            repository = HomeFixtureRepository(scenario: scenario)
            let suiteName = "com.yiru.mobile.fixture.home"
            defaults = UserDefaults(suiteName: suiteName) ?? .standard
            defaults.removePersistentDomain(forName: suiteName)
        }

        var body: some View {
            NavigationStack {
                HomeView(
                    hostRepository: repository,
                    connectionRuntime: repository,
                    workspaceRepository: repository,
                    accountsRepository: repository,
                    activityRepository: repository,
                    widgetSnapshotWriter: WidgetSnapshotWriter(),
                    recentWorkspaceStore: RecentWorkspaceStore(defaults: defaults),
                    snapshotCache: HomeSnapshotCache(defaults: defaults),
                    workspaceCreationRepository: creationRepository,
                    refreshRevision: 0,
                    showHost: { _ in },
                    showWorkspace: { _, _ in },
                    showPairing: {},
                    showActivityInsights: {},
                    showSettings: {},
                    showAccounts: { _ in },
                    editHost: { _ in },
                    hostsChanged: {}
                )
            }
        }
    }

    struct ActivityInsightsFixtureView: View {
        private let repository = HomeFixtureRepository(scenario: .dashboard)
        private let defaults: UserDefaults

        init() {
            let suiteName = "com.yiru.mobile.fixture.activity"
            defaults = UserDefaults(suiteName: suiteName) ?? .standard
            defaults.removePersistentDomain(forName: suiteName)
        }

        var body: some View {
            NavigationStack {
                ActivityInsightsView(
                    hosts: repository,
                    connectionRuntime: repository,
                    repository: repository,
                    defaults: defaults
                )
            }
        }
    }

    nonisolated struct HomeFixtureRepository: HostRepository, HostConnectionRuntime,
        WorkspaceRepository, AccountsRepository, ActivityStatsRepository
    {
        let scenario: HomeFixtureScenario

        func hosts() async throws -> [HostProfile] {
            switch scenario {
            case .dashboard: Self.hosts
            case .onboarding: []
            }
        }

        func credential(for _: String) async throws -> HostCredential? { nil }

        func saveAuthenticatedOffer(_: PairingOffer, connectedAt _: Date) async throws
            -> HostProfile
        {
            throw WorkspaceRepositoryError.rejectedMutation
        }

        func updateHost(hostID _: String, name _: String, endpoint _: String) async throws
            -> HostProfile
        {
            throw WorkspaceRepositoryError.rejectedMutation
        }

        func removeHost(hostID _: String) async throws {}

        func connectionSnapshots(forHostIDs _: [String]) async -> AsyncStream<
            [String: RuntimeConnectionSnapshot]
        > {
            AsyncStream { continuation in
                continuation.yield(Self.connections)
                continuation.finish()
            }
        }

        func reconnect(hostID _: String) async {}
        func disconnect(hostID _: String) async {}

        func workspaces(for hostID: String) async throws -> WorkspaceSnapshot {
            if hostID == Self.primaryHost.id {
                return try await WorkspaceListFixtureRepository().workspaces(for: hostID)
            }
            return WorkspaceSnapshot(workspaces: [], repos: [], totalCount: 0, isTruncated: false)
        }

        func allWorkspaceTabUpdates(for _: String) async throws
            -> AsyncThrowingStream<[String: [WorkspaceOpenTab]], Error>
        {
            AsyncThrowingStream { continuation in
                continuation.yield([:])
                continuation.finish()
            }
        }

        func activateWorkspace(hostID _: String, workspaceID _: String) async throws {}
        func sleepWorkspace(hostID _: String, workspaceID _: String) async throws {}

        func setWorkspacePinned(
            hostID _: String,
            workspaceID _: String,
            isPinned _: Bool
        ) async throws {}

        func removeWorkspace(hostID _: String, workspaceID _: String) async throws {}

        func accounts(for hostID: String) async throws -> AccountsSnapshot {
            hostID == Self.primaryHost.id
                ? AccountFixtureRepository.snapshot
                : AccountsSnapshot(
                    sections: []
                )
        }

        func accountUpdates(for hostID: String) async throws
            -> AsyncThrowingStream<AccountsSnapshot, Error>
        {
            AsyncThrowingStream { continuation in
                let snapshot =
                    hostID == Self.primaryHost.id
                    ? AccountFixtureRepository.snapshot : AccountsSnapshot(sections: [])
                continuation.yield(snapshot)
                continuation.finish()
            }
        }

        func selectAccount(hostID _: String, provider _: AccountProvider, accountID _: String?)
            async
            throws
        {}

        func activityStats(
            for hostID: String,
            range: ActivityUsageRange,
            refreshUsage _: Bool
        ) async throws -> ActivityStatsSummary? {
            guard hostID == Self.primaryHost.id else { return nil }
            return Self.activitySummary(range: range)
        }

        private static let primaryHost = HostProfile(
            id: "fixture-host",
            name: "Mac Studio",
            endpoint: "wss://mac-studio.local:6768",
            publicKeyBase64: "fixture",
            lastConnected: Date().addingTimeInterval(-90)
        )

        private static let secondaryHost = HostProfile(
            id: "fixture-offline-host",
            name: "MacBook Pro",
            endpoint: "wss://macbook-pro.local:6768",
            publicKeyBase64: "fixture",
            lastConnected: Date().addingTimeInterval(-4_200)
        )

        private static let hosts = [primaryHost, secondaryHost]

        private static let connections = [
            primaryHost.id: RuntimeConnectionSnapshot(
                hostID: primaryHost.id,
                hostName: primaryHost.name,
                phase: .connected,
                reconnectAttempt: 0,
                lastConnectedAt: Date().addingTimeInterval(-90)
            ),
            secondaryHost.id: RuntimeConnectionSnapshot(
                hostID: secondaryHost.id,
                hostName: secondaryHost.name,
                phase: .unreachable,
                reconnectAttempt: 2,
                lastConnectedAt: Date().addingTimeInterval(-4_200)
            ),
        ]

        private static func activitySummary(range: ActivityUsageRange) -> ActivityStatsSummary {
            let calendar = Calendar(identifier: .gregorian)
            let formatter = DateFormatter()
            formatter.calendar = calendar
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"
            let today = calendar.startOfDay(for: Date())
            let dayCount =
                switch range {
                case .sevenDays: 7
                case .thirtyDays: 30
                case .ninetyDays: 90
                }
            let daily = (0..<dayCount).compactMap { offset -> ActivityDailyPoint? in
                guard
                    let date = calendar.date(
                        byAdding: .day, value: offset - dayCount + 1, to: today)
                else { return nil }
                let activity = Double((offset * 3) % 9)
                let tokens = Double(18_000 + (offset * 17_341) % 94_000)
                return ActivityDailyPoint(
                    day: formatter.string(from: date),
                    activity: activity,
                    tokens: tokens,
                    valueUSD: tokens / 23_000
                )
            }
            let providers = daily.map { point in
                ActivityDailyProviderUsage(
                    day: point.day,
                    providers: [
                        ActivityProviderUsage(
                            provider: "claude",
                            tokens: point.tokens * 0.58,
                            valueUSD: (point.valueUSD ?? 0) * 0.58
                        ),
                        ActivityProviderUsage(
                            provider: "codex",
                            tokens: point.tokens * 0.42,
                            valueUSD: (point.valueUSD ?? 0) * 0.42
                        ),
                    ]
                )
            }
            return ActivityStatsSummary(
                totalAgentsSpawned: 428,
                totalPRsCreated: 36,
                totalAgentTimeMS: 412_200_000,
                firstEventAt: today.addingTimeInterval(-31_536_000).timeIntervalSince1970 * 1_000,
                daily: daily,
                dailyProviders: providers,
                models: [
                    ActivityBreakdown(
                        id: "claude-opus-4-1",
                        label: "Claude Opus 4.1",
                        sessions: 142,
                        tokens: 1_840_000,
                        valueUSD: 86.42,
                        providers: []
                    ),
                    ActivityBreakdown(
                        id: "gpt-5-codex",
                        label: "GPT-5 Codex",
                        sessions: 118,
                        tokens: 1_220_000,
                        valueUSD: 51.08,
                        providers: []
                    ),
                ],
                projects: [
                    ActivityBreakdown(
                        id: "yiru",
                        label: "Yiru",
                        sessions: 190,
                        tokens: 2_140_000,
                        valueUSD: 98.60,
                        providers: []
                    ),
                    ActivityBreakdown(
                        id: "atat",
                        label: "AtAt",
                        sessions: 70,
                        tokens: 920_000,
                        valueUSD: 38.90,
                        providers: []
                    ),
                ],
                usageRange: range.rawValue,
                hasUsageValue: true,
                hasUnpricedUsage: false
            )
        }
    }
#endif
