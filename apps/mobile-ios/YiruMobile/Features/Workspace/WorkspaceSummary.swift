import Foundation

nonisolated enum WorkspaceActivity: String, Sendable {
    case active
    case working
    case permission
    case done
    case inactive
}

nonisolated struct WorkspaceSummary: Identifiable, Hashable, Sendable {
    let id: String
    let repoName: String
    let path: String
    let branch: String
    let name: String
    let workspaceStatus: String
    let isArchived: Bool
    let isMainWorktree: Bool
    let isPinned: Bool
    let isActive: Bool
    let isUnread: Bool
    let liveTerminalCount: Int
    let lastActivity: Date?
    let lastOutput: Date?
    let preview: String
    let activity: WorkspaceActivity

    init(wire: MobileWorkspaceListItemWire) {
        id = wire.worktreeId
        repoName = wire.repo
        path = wire.path
        branch = wire.branch
        name = wire.displayName
        workspaceStatus = wire.workspaceStatus
        isArchived = wire.isArchived
        isMainWorktree = wire.isMainWorktree ?? false
        isPinned = wire.isPinned
        isActive = wire.isActive
        isUnread = wire.unread
        liveTerminalCount = wire.liveTerminalCount
        lastActivity = wire.lastActivityAt.map(Self.date(milliseconds:))
        lastOutput = wire.lastOutputAt.map(Self.date(milliseconds:))
        preview = wire.preview
        activity = WorkspaceActivity(rawValue: wire.status.rawValue) ?? .inactive
    }

    private static func date(milliseconds: Int64) -> Date {
        Date(timeIntervalSince1970: TimeInterval(milliseconds) / 1_000)
    }
}

nonisolated struct WorkspaceSnapshot: Sendable {
    let workspaces: [WorkspaceSummary]
    let totalCount: Int
    let isTruncated: Bool
}
