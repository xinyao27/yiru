import Foundation

nonisolated enum WorkspaceKind: String, Codable, Sendable {
    case git
    case folderWorkspace = "folder-workspace"
}

nonisolated enum WorkspaceActivity: String, Codable, Sendable {
    case active
    case working
    case permission
    case done
    case inactive
}

nonisolated struct WorkspacePullRequest: Codable, Hashable, Sendable {
    let number: Int
    let state: String
}

nonisolated enum WorkspaceAgentState: String, Codable, Sendable {
    case working
    case blocked
    case waiting
    case done
}

nonisolated struct WorkspaceAgent: Codable, Hashable, Sendable {
    let paneKey: String
    let parentPaneKey: String?
    let state: WorkspaceAgentState
    let agentType: String?
    let prompt: String
    let displayName: String?
    let lastAssistantMessage: String?
    let interrupted: Bool
    let stateStartedAt: Date
    let updatedAt: Date

    init(wire: MobileWorkspaceAgentWire) {
        paneKey = wire.paneKey
        parentPaneKey = wire.parentPaneKey
        state = WorkspaceAgentState(rawValue: wire.state.rawValue) ?? .done
        agentType = wire.agentType
        prompt = wire.prompt
        displayName = wire.displayName ?? wire.taskTitle
        lastAssistantMessage = wire.lastAssistantMessage
        interrupted = wire.interrupted
        stateStartedAt = Self.date(milliseconds: wire.stateStartedAt)
        updatedAt = Self.date(milliseconds: wire.updatedAt)
    }

    private static func date(milliseconds: Int64) -> Date {
        Date(timeIntervalSince1970: TimeInterval(milliseconds) / 1_000)
    }
}

nonisolated struct WorkspaceSummary: Codable, Identifiable, Hashable, Sendable {
    static let floatingID = "global-floating-terminal"

    let id: String
    let kind: WorkspaceKind
    let repoID: String
    private(set) var executionHostID: String? = nil
    private(set) var resumeTargetStatus: String? = nil
    private(set) var terminalPlatform: String? = nil
    private(set) var priorWorktreeIDs: [String] = []
    let repoName: String
    let path: String
    let branch: String
    let name: String
    let workspaceStatus: String
    let isArchived: Bool
    let isMainWorktree: Bool
    let reportedMainWorktree: Bool?
    var hasHostSidebarActivity: Bool
    let worktreeInstanceID: String?
    let lineageWorktreeInstanceID: String?
    let parentWorktreeInstanceID: String?
    let parentWorktreeID: String?
    let childWorktreeIDs: [String]
    let sortOrder: Double
    let manualOrder: Double?
    let createdAt: Date?
    let linkedPullRequest: WorkspacePullRequest?
    let linkedGitLabMergeRequest: Int?
    let comment: String
    var isPinned: Bool
    var isActive: Bool
    let isUnread: Bool
    var liveTerminalCount: Int
    var hasAttachedPty: Bool
    let lastActivity: Date?
    let lastOutput: Date?
    let preview: String
    var activity: WorkspaceActivity
    let agents: [WorkspaceAgent]

    init(wire: MobileWorkspaceListItemWire) {
        id = wire.worktreeId
        kind = WorkspaceKind(rawValue: wire.workspaceKind?.rawValue ?? "git") ?? .git
        repoID = wire.repoId
        executionHostID = wire.hostId
        resumeTargetStatus = wire.resumeTargetStatus?.rawValue
        terminalPlatform = wire.terminalPlatform
        priorWorktreeIDs = wire.priorWorktreeIds ?? []
        repoName = wire.repo
        path = wire.path
        branch = wire.branch
        name = wire.displayName
        workspaceStatus = wire.workspaceStatus
        isArchived = wire.isArchived
        isMainWorktree = wire.isMainWorktree ?? false
        reportedMainWorktree = wire.isMainWorktree
        hasHostSidebarActivity = wire.hasHostSidebarActivity
        worktreeInstanceID = wire.worktreeInstanceId
        lineageWorktreeInstanceID = wire.lineageWorktreeInstanceId
        parentWorktreeInstanceID = wire.parentWorktreeInstanceId
        parentWorktreeID = wire.parentWorktreeId
        childWorktreeIDs = wire.childWorktreeIds
        sortOrder = wire.sortOrder
        manualOrder = wire.manualOrder
        createdAt = wire.createdAt.map(Self.date(milliseconds:))
        linkedPullRequest = wire.linkedPR.map {
            WorkspacePullRequest(number: $0.number, state: $0.state)
        }
        linkedGitLabMergeRequest = wire.linkedGitLabMR
        comment = wire.comment
        isPinned = wire.isPinned
        isActive = wire.isActive
        isUnread = wire.unread
        liveTerminalCount = wire.liveTerminalCount
        hasAttachedPty = wire.hasAttachedPty
        lastActivity = wire.lastActivityAt.map(Self.date(milliseconds:))
        lastOutput = wire.lastOutputAt.map(Self.date(milliseconds:))
        preview = wire.preview
        activity = WorkspaceActivity(rawValue: wire.status.rawValue) ?? .inactive
        agents = wire.agents.map(WorkspaceAgent.init(wire:))
    }

    private static func date(milliseconds: Int64) -> Date {
        Date(timeIntervalSince1970: TimeInterval(milliseconds) / 1_000)
    }

    mutating func applyLegacyPinnedState() {
        // Why: the desktop pin mutation is best-effort, so a local overlay holds the new state
        // until the server-authoritative workspace snapshot confirms it.
        isPinned = true
    }

    mutating func applyOptimisticActivation() {
        isActive = true
        hasHostSidebarActivity = true
    }

    mutating func applyOptimisticDeactivation() {
        isActive = false
        hasHostSidebarActivity = false
    }

    mutating func applyOptimisticSleep() {
        activity = .inactive
        hasHostSidebarActivity = false
        isActive = false
        liveTerminalCount = 0
        hasAttachedPty = false
    }

    static func floating(hostID: String) -> WorkspaceSummary {
        WorkspaceSummary(
            floatingHostID: hostID,
            name: String(localized: "Floating Workspace")
        )
    }

    static func legacyCached(
        hostID: String,
        worktreeID: String,
        repo: String,
        branch: String,
        displayName: String,
        liveTerminalCount: Int,
        status: String?,
        savedAt: Date
    ) -> WorkspaceSummary {
        let activity = WorkspaceActivity(rawValue: status ?? "inactive") ?? .inactive
        return WorkspaceSummary(
            legacyHostID: hostID,
            worktreeID: worktreeID,
            repo: repo,
            branch: branch,
            displayName: displayName,
            liveTerminalCount: max(0, liveTerminalCount),
            activity: activity,
            savedAt: savedAt
        )
    }

    private init(floatingHostID: String, name: String) {
        id = Self.floatingID
        kind = .folderWorkspace
        repoID = ""
        executionHostID = floatingHostID
        resumeTargetStatus = "local"
        terminalPlatform = nil
        priorWorktreeIDs = []
        repoName = ""
        path = ""
        branch = ""
        self.name = name
        workspaceStatus = "active"
        isArchived = false
        isMainWorktree = false
        reportedMainWorktree = nil
        hasHostSidebarActivity = false
        worktreeInstanceID = nil
        lineageWorktreeInstanceID = nil
        parentWorktreeInstanceID = nil
        parentWorktreeID = nil
        childWorktreeIDs = []
        sortOrder = 0
        manualOrder = nil
        createdAt = nil
        linkedPullRequest = nil
        linkedGitLabMergeRequest = nil
        comment = ""
        isPinned = false
        isActive = true
        isUnread = false
        liveTerminalCount = 0
        hasAttachedPty = false
        lastActivity = nil
        lastOutput = nil
        preview = ""
        activity = .active
        agents = []
    }

    private init(
        legacyHostID: String,
        worktreeID: String,
        repo: String,
        branch: String,
        displayName: String,
        liveTerminalCount: Int,
        activity: WorkspaceActivity,
        savedAt: Date
    ) {
        id = worktreeID
        kind = .git
        repoID = repo
        executionHostID = legacyHostID
        resumeTargetStatus = "local"
        terminalPlatform = nil
        priorWorktreeIDs = []
        repoName = repo
        path = ""
        self.branch = branch
        name = displayName
        workspaceStatus = activity.rawValue
        isArchived = false
        isMainWorktree = false
        reportedMainWorktree = nil
        hasHostSidebarActivity = activity != .inactive
        worktreeInstanceID = nil
        lineageWorktreeInstanceID = nil
        parentWorktreeInstanceID = nil
        parentWorktreeID = nil
        childWorktreeIDs = []
        sortOrder = 0
        manualOrder = nil
        createdAt = nil
        linkedPullRequest = nil
        linkedGitLabMergeRequest = nil
        comment = ""
        isPinned = false
        isActive = activity == .active || activity == .working
        isUnread = activity == .permission
        self.liveTerminalCount = liveTerminalCount
        hasAttachedPty = liveTerminalCount > 0
        lastActivity = savedAt
        lastOutput = savedAt
        preview = ""
        self.activity = activity
        agents = []
    }
}

nonisolated enum WorkspaceRepoIcon: Hashable, Sendable {
    case lucide(name: String)
    case emoji(String)
    case image(data: Data?, url: URL?, label: String?)
}

nonisolated enum WorkspaceRepoKind: String, Hashable, Sendable {
    case git
    case folder
}

nonisolated struct WorkspaceRepoSlug: Hashable, Sendable {
    let owner: String
    let repo: String
}

nonisolated struct WorkspaceRepo: Hashable, Sendable {
    let id: String
    let path: String
    let name: String
    let badgeColor: String
    let connectionID: String?
    let icon: WorkspaceRepoIcon?
    let kind: WorkspaceRepoKind
    let slug: WorkspaceRepoSlug?
    let remoteURL: String?

    init(wire: MobileRepoListItemWire) {
        id = wire.id
        path = wire.path
        name = wire.displayName
        badgeColor = wire.badgeColor
        connectionID = wire.connectionId
        kind = WorkspaceRepoKind(rawValue: wire.kind?.rawValue ?? "git") ?? .git
        if let upstream = wire.upstream {
            slug = WorkspaceRepoSlug(owner: upstream.owner, repo: upstream.repo)
        } else {
            slug = Self.slug(remoteURL: wire.gitRemoteIdentity?.remoteUrl)
        }
        remoteURL = wire.gitRemoteIdentity?.remoteUrl
        switch wire.repoIcon {
        case .lucide(let name): icon = .lucide(name: name)
        case .emoji(let emoji): icon = .emoji(emoji)
        case .image(let source, _, let label):
            if source.hasPrefix("data:image/png;base64,"),
                let delimiter = source.firstIndex(of: ",")
            {
                icon = .image(
                    data: Data(base64Encoded: String(source[source.index(after: delimiter)...])),
                    url: nil,
                    label: label
                )
            } else {
                icon = .image(data: nil, url: URL(string: source), label: label)
            }
        case nil: icon = nil
        }
    }

    private static func slug(remoteURL: String?) -> WorkspaceRepoSlug? {
        guard var value = remoteURL?.trimmingCharacters(in: .whitespacesAndNewlines),
            !value.isEmpty
        else { return nil }
        if let range = value.range(of: "github.com:") {
            value = String(value[range.upperBound...])
        } else if let range = value.range(of: "github.com/") {
            value = String(value[range.upperBound...])
        } else {
            return nil
        }
        if value.hasSuffix(".git") { value.removeLast(4) }
        let parts = value.split(separator: "/")
        guard parts.count == 2 else { return nil }
        return WorkspaceRepoSlug(owner: String(parts[0]), repo: String(parts[1]))
    }
}

nonisolated enum WorkspaceOpenTabKind: String, Hashable, Sendable {
    case terminal
    case markdown
    case file
    case browser
}

nonisolated struct WorkspaceOpenTab: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let kind: WorkspaceOpenTabKind
    let isActive: Bool
    let leafID: String?
    let terminalID: String?
    let agentID: String?

    init(
        id: String,
        title: String,
        kind: WorkspaceOpenTabKind,
        isActive: Bool,
        leafID: String? = nil,
        terminalID: String? = nil,
        agentID: String? = nil
    ) {
        self.id = id
        self.title = title
        self.kind = kind
        self.isActive = isActive
        self.leafID = leafID
        self.terminalID = terminalID
        self.agentID = agentID
    }
}

nonisolated struct WorkspaceSnapshot: Sendable {
    let workspaces: [WorkspaceSummary]
    let repos: [WorkspaceRepo]
    let totalCount: Int
    let isTruncated: Bool
}
