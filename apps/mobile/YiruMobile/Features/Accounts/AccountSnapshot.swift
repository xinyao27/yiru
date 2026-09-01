import Foundation

nonisolated enum AccountProvider: String, CaseIterable, Codable, Sendable {
    case claude
    case codex
    case cursor
    case gemini
    case opencodeGo = "opencode-go"
    case kimi
    case antigravity
    case minimax
    case grok

    var title: String {
        switch self {
        case .claude: "Claude"
        case .codex: "Codex"
        case .cursor: "Cursor"
        case .gemini: "Gemini"
        case .opencodeGo: "OpenCode Go"
        case .kimi: "Kimi"
        case .antigravity: "Antigravity"
        case .minimax: "MiniMax"
        case .grok: "Grok"
        }
    }

    var supportsSelection: Bool { self == .claude || self == .codex }
}

nonisolated struct ManagedAccount: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let email: String
    let subtitle: String?
}

nonisolated struct AccountUsageWindow: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let label: String
    let compactLabel: String
    let usedPercent: Double
    let resetsAt: Date?
}

nonisolated enum AccountUsageStatus: String, Codable, Sendable {
    case idle
    case fetching
    case ok
    case error
    case unavailable
}

nonisolated struct AccountProviderUsage: Codable, Hashable, Sendable {
    let windows: [AccountUsageWindow]
    let plan: String?
    let updatedAt: Date?
    let error: String?
    let status: AccountUsageStatus
}

nonisolated struct InactiveAccountUsage: Codable, Hashable, Sendable {
    let accountID: String
    let usage: AccountProviderUsage?
    let isFetching: Bool
}

nonisolated struct AccountProviderSection: Codable, Identifiable, Hashable, Sendable {
    let provider: AccountProvider
    let accounts: [ManagedAccount]
    let activeAccountID: String?
    let usage: AccountProviderUsage?
    let inactiveUsage: [InactiveAccountUsage]

    var id: AccountProvider { provider }
}

nonisolated struct AccountsSnapshot: Codable, Sendable {
    let sections: [AccountProviderSection]
}

extension AccountsSnapshot {
    nonisolated init(wire: MobileAccountsSnapshotWire) {
        let claudeAccounts = wire.claude.accounts.map {
            ManagedAccount(id: $0.id, email: $0.email, subtitle: $0.organizationName)
        }
        let codexAccounts = wire.codex.accounts.map {
            ManagedAccount(id: $0.id, email: $0.email, subtitle: $0.workspaceLabel)
        }
        let inactiveClaude = wire.rateLimits.inactiveClaudeAccounts.map(
            InactiveAccountUsage.init(wire:)
        )
        let inactiveCodex = wire.rateLimits.inactiveCodexAccounts.map(
            InactiveAccountUsage.init(wire:)
        )
        sections = AccountProvider.allCases.compactMap { provider in
            let accounts: [ManagedAccount]
            let activeAccountID: String?
            let inactiveUsage: [InactiveAccountUsage]
            switch provider {
            case .claude:
                accounts = claudeAccounts
                activeAccountID = wire.claude.activeAccountId
                inactiveUsage = inactiveClaude
            case .codex:
                accounts = codexAccounts
                activeAccountID = wire.codex.activeAccountId
                inactiveUsage = inactiveCodex
            default:
                accounts = []
                activeAccountID = nil
                inactiveUsage = []
            }
            let usage = AccountProviderUsage(wire: wire.usage(for: provider))
            guard !accounts.isEmpty || usage?.isRenderable == true else { return nil }
            return AccountProviderSection(
                provider: provider,
                accounts: accounts,
                activeAccountID: activeAccountID,
                usage: usage,
                inactiveUsage: inactiveUsage
            )
        }
    }
}

private extension MobileAccountsSnapshotWire {
    nonisolated func usage(for provider: AccountProvider) -> MobileProviderRateLimitsWire? {
        switch provider {
        case .claude: rateLimits.claude
        case .codex: rateLimits.codex
        case .cursor: rateLimits.cursor
        case .gemini: rateLimits.gemini
        case .opencodeGo: rateLimits.opencodeGo
        case .kimi: rateLimits.kimi
        case .antigravity: rateLimits.antigravity
        case .minimax: rateLimits.minimax
        case .grok: rateLimits.grok
        }
    }
}

private extension AccountProviderUsage {
    nonisolated init?(wire: MobileProviderRateLimitsWire?) {
        guard let wire else { return nil }
        var windows: [AccountUsageWindow] = []
        if let buckets = wire.buckets, !buckets.isEmpty {
            windows += buckets.enumerated().map { index, bucket in
                AccountUsageWindow(
                    id: "bucket-\(index)-\(bucket.name)",
                    label: bucket.name,
                    compactLabel: bucket.name,
                    usedPercent: bucket.usedPercent,
                    resetsAt: bucket.resetsAt.map(Self.date(milliseconds:))
                )
            }
            if let weekly = wire.weekly {
                windows.append(Self.window(weekly, id: "weekly", label: "Weekly", compact: "wk"))
            }
        } else {
            if let session = wire.session {
                windows.append(Self.window(session, id: "session", label: "Session", compact: "5h"))
            }
            if let weekly = wire.weekly {
                windows.append(Self.window(weekly, id: "weekly", label: "Weekly", compact: "wk"))
            }
            if let fable = wire.fableWeekly {
                windows.append(Self.window(fable, id: "fable", label: "Fable", compact: "Fable"))
            }
            if let monthly = wire.monthly {
                windows.append(Self.window(monthly, id: "monthly", label: "Monthly", compact: "mo"))
            }
        }
        self.windows = windows
        plan = Self.planLabel(wire.planType)
        updatedAt = wire.updatedAt > 0 ? Self.date(milliseconds: wire.updatedAt) : nil
        error = wire.error
        status = AccountUsageStatus(rawValue: wire.status.rawValue) ?? .unavailable
    }

    // Why: matches the mobile accounts screen's actual visibility check (accounts.tsx) —
    // a provider section is hidden only when there are no accounts AND usage is
    // unavailable. 'idle' (not yet polled) still renders with a "Loading usage…"
    // placeholder rather than being hidden.
    nonisolated var isRenderable: Bool {
        !windows.isEmpty || status != .unavailable
    }

    nonisolated static func window(
        _ wire: MobileRateLimitWindowWire,
        id: String,
        label: String,
        compact: String
    ) -> AccountUsageWindow {
        AccountUsageWindow(
            id: id,
            label: label,
            compactLabel: compact,
            usedPercent: wire.usedPercent,
            resetsAt: wire.resetsAt.map(date(milliseconds:))
        )
    }

    nonisolated static func date(milliseconds: Double) -> Date {
        Date(timeIntervalSince1970: milliseconds / 1_000)
    }

    nonisolated static func planLabel(_ value: String?) -> String? {
        let words = value?.split(whereSeparator: { $0 == " " || $0 == "_" || $0 == "-" }) ?? []
        guard !words.isEmpty else { return nil }
        return words.map { word in
            word.lowercased() == "chatgpt" ? "ChatGPT" : word.capitalized
        }.joined(separator: " ")
    }
}

private extension InactiveAccountUsage {
    nonisolated init(wire: MobileInactiveAccountUsageWire) {
        accountID = wire.accountId
        usage = AccountProviderUsage(wire: wire.rateLimits)
        isFetching = wire.isFetching
    }
}
