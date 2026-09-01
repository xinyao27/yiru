import Foundation

nonisolated enum WorkspaceSetupRunPolicy: String, Sendable {
    case ask
    case runByDefault
    case skipByDefault

    init(wire: MobileWorkspaceSetupRunPolicyWire) {
        switch wire {
        case .ask: self = .ask
        case .runByDefault: self = .runByDefault
        case .skipByDefault: self = .skipByDefault
        }
    }
}

nonisolated enum WorkspaceSetupDecision: String, Sendable {
    case inherit
    case run
    case skip

    var wire: MobileWorkspaceSetupDecisionWire {
        switch self {
        case .inherit: .inherit
        case .run: .run
        case .skip: .skip
        }
    }
}

nonisolated struct WorkspaceSetupTrust: Hashable, Sendable {
    let contentHash: String
    let scriptContent: String
}

nonisolated struct WorkspaceSetupDetails: Hashable, Sendable {
    let command: String?
    let source: String?
    let runPolicy: WorkspaceSetupRunPolicy
    let trust: WorkspaceSetupTrust?

    static let empty = WorkspaceSetupDetails(
        command: nil,
        source: nil,
        runPolicy: .runByDefault,
        trust: nil
    )

    init(wire: MobileRepoHooksResultWire) {
        let command = wire.hooks?.scripts.setup?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.command = command?.isEmpty == false ? command : nil
        source = wire.source
        runPolicy = WorkspaceSetupRunPolicy(wire: wire.setupRunPolicy)
        trust = wire.setupTrust.map {
            WorkspaceSetupTrust(contentHash: $0.contentHash, scriptContent: $0.scriptContent)
        }
    }

    private init(
        command: String?,
        source: String?,
        runPolicy: WorkspaceSetupRunPolicy,
        trust: WorkspaceSetupTrust?
    ) {
        self.command = command
        self.source = source
        self.runPolicy = runPolicy
        self.trust = trust
    }
}

nonisolated struct WorkspaceTrustedHookEntry: Hashable, Sendable {
    let contentHash: String
    let approvedAt: Double
}

nonisolated struct WorkspaceTrustedHookRepo: Hashable, Sendable {
    let allApprovedAt: Double?
    let setup: WorkspaceTrustedHookEntry?
    let archive: WorkspaceTrustedHookEntry?

    init(wire: MobileTrustedYiruHookRepoWire) {
        allApprovedAt = wire.all?.approvedAt
        setup = wire.setup.map {
            WorkspaceTrustedHookEntry(contentHash: $0.contentHash, approvedAt: $0.approvedAt)
        }
        archive = wire.archive.map {
            WorkspaceTrustedHookEntry(contentHash: $0.contentHash, approvedAt: $0.approvedAt)
        }
    }

    init(
        allApprovedAt: Double?,
        setup: WorkspaceTrustedHookEntry?,
        archive: WorkspaceTrustedHookEntry?
    ) {
        self.allApprovedAt = allApprovedAt
        self.setup = setup
        self.archive = archive
    }

    var wire: MobileTrustedYiruHookRepoWire {
        MobileTrustedYiruHookRepoWire(
            all: allApprovedAt.map(MobileTrustedYiruHookApprovalWire.init(approvedAt:)),
            setup: setup.map {
                MobileTrustedYiruHookEntryWire(
                    contentHash: $0.contentHash,
                    approvedAt: $0.approvedAt
                )
            },
            archive: archive.map {
                MobileTrustedYiruHookEntryWire(
                    contentHash: $0.contentHash,
                    approvedAt: $0.approvedAt
                )
            }
        )
    }
}

typealias WorkspaceTrustedHooks = [String: WorkspaceTrustedHookRepo]

nonisolated struct WorkspaceSetupTrustPrompt: Identifiable, Hashable, Sendable {
    let repoID: String
    let repoName: String
    let scriptContent: String
    let contentHash: String
    let wasPreviouslyApproved: Bool

    var id: String { "\(repoID):\(contentHash)" }
}

nonisolated extension Dictionary where Key == String, Value == WorkspaceTrustedHookRepo {
    func trustsSetup(repoID: String, contentHash: String) -> Bool {
        guard let repo = self[repoID] else { return false }
        return repo.allApprovedAt != nil || repo.setup?.contentHash == contentHash
    }

    func approvingSetup(
        repoID: String,
        contentHash: String,
        alwaysTrust: Bool,
        approvedAt: Double = Date.now.timeIntervalSince1970 * 1_000
    ) -> Self {
        let existing = self[repoID]
        var copy = self
        copy[repoID] = WorkspaceTrustedHookRepo(
            allApprovedAt: alwaysTrust ? approvedAt : existing?.allApprovedAt,
            setup: alwaysTrust
                ? existing?.setup
                : WorkspaceTrustedHookEntry(contentHash: contentHash, approvedAt: approvedAt),
            archive: existing?.archive
        )
        return copy
    }
}
