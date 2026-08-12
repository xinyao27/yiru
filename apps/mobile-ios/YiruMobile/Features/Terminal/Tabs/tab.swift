import Foundation

nonisolated enum TerminalWorkspaceTerminal: Hashable, Sendable {
    case pending
    case ready(TerminalTarget)
}

nonisolated enum TerminalWorkspaceTabContent: Hashable, Sendable {
    case terminal(TerminalWorkspaceTerminal)
    case markdown(path: String?)
    case file(path: String?)
    case browser(url: String?)
}

nonisolated struct TerminalWorkspaceTab: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let isActive: Bool
    let isPinned: Bool
    let leafID: String?
    let content: TerminalWorkspaceTabContent

    var systemImage: String {
        switch content {
        case .terminal: "apple.terminal"
        case .markdown: "doc.richtext"
        case .file: "doc.text"
        case .browser: "globe"
        }
    }

    var terminalTarget: TerminalTarget? {
        guard case .terminal(.ready(let target)) = content else { return nil }
        return target
    }
}

nonisolated struct TerminalWorkspaceSnapshot: Sendable {
    let worktree: String
    let publicationEpoch: String
    let snapshotVersion: Int64
    let activeTabID: String?
    let tabs: [TerminalWorkspaceTab]
}
