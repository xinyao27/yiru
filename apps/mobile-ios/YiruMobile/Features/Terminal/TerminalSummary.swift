import Foundation

nonisolated struct TerminalSummary: Identifiable, Hashable, Sendable {
    let id: String
    let ptyID: String?
    let worktreeID: String
    let worktreePath: String
    let branch: String
    let tabID: String
    let leafID: String
    let title: String?
    let isConnected: Bool
    let isWritable: Bool
    let lastOutput: Date?
    let preview: String

    init(wire: MobileTerminalSummaryWire) {
        id = wire.handle
        ptyID = wire.ptyId
        worktreeID = wire.worktreeId
        worktreePath = wire.worktreePath
        branch = wire.branch
        tabID = wire.tabId
        leafID = wire.leafId
        title = wire.title
        isConnected = wire.connected
        isWritable = wire.writable
        lastOutput = wire.lastOutputAt.map {
            Date(timeIntervalSince1970: TimeInterval($0) / 1_000)
        }
        preview = wire.preview
    }

    var displayTitle: String {
        guard let title, !title.isEmpty else { return branch }
        return title
    }
}

nonisolated struct TerminalSnapshot: Sendable {
    let terminals: [TerminalSummary]
    let totalCount: Int
    let isTruncated: Bool
}
