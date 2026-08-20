#if DEBUG
    import Foundation
    import SwiftUI

    struct AccountFixtureView: View {
        private let repository = AccountFixtureRepository()

        var body: some View {
            NavigationStack {
                AccountView(
                    host: AccountFixtureRepository.host,
                    repository: repository,
                    connectionRuntime: repository
                )
            }
        }
    }

    nonisolated final class AccountFixtureRepository: AccountsRepository, HostConnectionRuntime,
        @unchecked Sendable
    {
        static let host = HostProfile(
            id: "fixture-host",
            name: "Mac Studio",
            endpoint: "wss://fixture.invalid",
            publicKeyBase64: "fixture",
            lastConnected: Date()
        )

        func accounts(for _: String) async throws -> AccountsSnapshot { Self.snapshot }

        func accountUpdates(for _: String) async throws
            -> AsyncThrowingStream<AccountsSnapshot, Error>
        {
            AsyncThrowingStream { continuation in
                continuation.yield(Self.snapshot)
            }
        }

        func selectAccount(hostID _: String, provider _: AccountProvider, accountID _: String?)
            async
            throws
        {}

        func connectionSnapshots(forHostIDs _: [String]) async -> AsyncStream<
            [String: RuntimeConnectionSnapshot]
        > {
            AsyncStream { continuation in
                continuation.yield([
                    Self.host.id: RuntimeConnectionSnapshot(
                        hostID: Self.host.id,
                        hostName: Self.host.name,
                        phase: .connected,
                        reconnectAttempt: 0,
                        lastConnectedAt: Date()
                    )
                ])
            }
        }

        func reconnect(hostID _: String) async {}
        func disconnect(hostID _: String) async {}

        static let snapshot = AccountsSnapshot(sections: [
            AccountProviderSection(
                provider: .claude,
                accounts: [
                    ManagedAccount(
                        id: "claude-primary",
                        email: "xinyao@example.com",
                        subtitle: "Yiru"
                    ),
                    ManagedAccount(
                        id: "claude-work",
                        email: "work@example.com",
                        subtitle: "Megamouth"
                    ),
                ],
                activeAccountID: "claude-primary",
                usage: AccountProviderUsage(
                    windows: [
                        AccountUsageWindow(
                            id: "session",
                            label: "Session",
                            compactLabel: "5h",
                            usedPercent: 38,
                            resetsAt: Date().addingTimeInterval(3 * 60 * 60 + 54 * 60)
                        ),
                        AccountUsageWindow(
                            id: "weekly",
                            label: "Weekly",
                            compactLabel: "wk",
                            usedPercent: 72,
                            resetsAt: Date().addingTimeInterval(3 * 24 * 60 * 60)
                        ),
                    ],
                    plan: "Max",
                    updatedAt: Date().addingTimeInterval(-120),
                    error: nil,
                    status: .ok
                ),
                inactiveUsage: [
                    InactiveAccountUsage(
                        accountID: "claude-work",
                        usage: AccountProviderUsage(
                            windows: [
                                AccountUsageWindow(
                                    id: "session",
                                    label: "Session",
                                    compactLabel: "5h",
                                    usedPercent: 84,
                                    resetsAt: nil
                                ),
                                AccountUsageWindow(
                                    id: "weekly",
                                    label: "Weekly",
                                    compactLabel: "wk",
                                    usedPercent: 52,
                                    resetsAt: nil
                                ),
                            ],
                            plan: "Team",
                            updatedAt: Date(),
                            error: nil,
                            status: .ok
                        ),
                        isFetching: false
                    )
                ]
            ),
            AccountProviderSection(
                provider: .codex,
                accounts: [],
                activeAccountID: nil,
                usage: AccountProviderUsage(
                    windows: [
                        AccountUsageWindow(
                            id: "session",
                            label: "Session",
                            compactLabel: "5h",
                            usedPercent: 21,
                            resetsAt: Date().addingTimeInterval(47 * 60)
                        )
                    ],
                    plan: "ChatGPT Plus",
                    updatedAt: Date(),
                    error: nil,
                    status: .ok
                ),
                inactiveUsage: []
            ),
            AccountProviderSection(
                provider: .gemini,
                accounts: [],
                activeAccountID: nil,
                usage: AccountProviderUsage(
                    windows: [],
                    plan: nil,
                    updatedAt: nil,
                    error: nil,
                    status: .fetching
                ),
                inactiveUsage: []
            ),
        ])
    }
#endif
