import Foundation

nonisolated enum AgentHistoryScope: String, CaseIterable, Sendable {
    case workspace
    case project
    case all
}

nonisolated struct AgentHistoryMessage: Hashable, Sendable {
    let role: String
    let text: String
    let timestamp: String?
}

nonisolated struct AgentHistorySession: Identifiable, Hashable, Sendable {
    let id: String
    let agent: String
    let sessionID: String
    let title: String
    let cwd: String?
    let filePath: String
    let codexHome: String?
    let createdAt: String?
    let updatedAt: String?
    let modifiedAt: String
    let messageCount: Int
    let queuedMessageCount: Int
    let subagentTranscriptCount: Int
    let previewMessages: [AgentHistoryMessage]
    let resumeCommand: String

    var displayTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? String(localized: "Untitled session") : title
    }

    var displayMessages: [AgentHistoryMessage] {
        let conversation = previewMessages.filter { $0.role == "user" || $0.role == "assistant" }
        return conversation.isEmpty ? previewMessages : conversation
    }

    var latestMessage: String {
        displayMessages.last?.text.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    var updatedDate: Date? {
        ISODateParser.date(updatedAt ?? modifiedAt)
    }

    var folderLabel: String {
        guard let cwd, !cwd.isEmpty else { return String(localized: "Unknown location") }
        let parts = cwd.replacingOccurrences(of: "\\", with: "/").split(separator: "/")
        return parts.suffix(2).joined(separator: "/")
    }

    init(wire: MobileAgentHistorySessionWire) {
        id = wire.id
        agent = wire.agent
        sessionID = wire.sessionId
        title = wire.title
        cwd = wire.cwd
        filePath = wire.filePath
        codexHome = wire.codexHome
        createdAt = wire.createdAt
        updatedAt = wire.updatedAt
        modifiedAt = wire.modifiedAt
        messageCount = wire.messageCount
        queuedMessageCount = wire.queuedMessageCount
        subagentTranscriptCount = wire.subagentTranscriptCount
        previewMessages = wire.previewMessages.map {
            AgentHistoryMessage(role: $0.role.rawValue, text: $0.text, timestamp: $0.timestamp)
        }
        resumeCommand = wire.resumeCommand
    }
}

nonisolated struct AgentHistoryIssue: Hashable, Sendable {
    let agent: String
    let path: String
    let message: String
}

nonisolated struct AgentHistorySnapshot: Sendable {
    let sessions: [AgentHistorySession]
    let issues: [AgentHistoryIssue]
}
