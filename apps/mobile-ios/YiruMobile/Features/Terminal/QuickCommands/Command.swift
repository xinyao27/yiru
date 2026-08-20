import Foundation

private nonisolated enum TerminalQuickCommandConstants {
    static let displayPreviewLength = 240
}

nonisolated enum TerminalQuickCommandScope: Hashable, Sendable {
    case global
    case repository(String)

    var repoID: String? {
        guard case .repository(let id) = self else { return nil }
        return id
    }
}

nonisolated enum TerminalQuickCommandAction: Hashable, Sendable {
    case terminal(command: String, appendEnter: Bool)
    case agent(agentID: String, prompt: String)
}

nonisolated struct TerminalQuickCommand: Hashable, Identifiable, Sendable {
    let id: String
    let label: String
    let scope: TerminalQuickCommandScope
    let action: TerminalQuickCommandAction

    init?(wire: MobileQuickCommandWire) {
        let id = wire.id.trimmingCharacters(in: .whitespacesAndNewlines)
        let label = wire.label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty, id.count <= 80, label.count <= 80 else { return nil }
        let scope: TerminalQuickCommandScope
        if wire.scope?.type == "repo", let repoID = wire.scope?.repoId,
            !repoID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        {
            scope = .repository(String(repoID.prefix(200)))
        } else {
            scope = .global
        }
        let action: TerminalQuickCommandAction
        switch wire.action {
        case "agent-prompt":
            guard let agent = wire.agent, supportsQuickCommandAgent(agent),
                let prompt = wire.prompt,
                !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else { return nil }
            action = .agent(
                agentID: agent, prompt: trimTrailingWhitespace(String(prompt.prefix(6_000))))
        case "terminal-command":
            guard let command = wire.command else { return nil }
            action = .terminal(
                command: trimTrailingWhitespace(String(command.prefix(4_000))),
                appendEnter: wire.appendEnter != false
            )
        default:
            return nil
        }
        self.id = id
        self.label = label
        self.scope = scope
        self.action = action
    }

    init(
        id: String,
        label: String,
        scope: TerminalQuickCommandScope,
        action: TerminalQuickCommandAction
    ) {
        self.id = id
        self.label = label
        self.scope = scope
        self.action = action
    }

    var preview: String {
        switch action {
        case .terminal(let command, _): command
        case .agent(let agentID, let prompt): "\(quickCommandAgentLabel(agentID)): \(prompt)"
        }
    }

    var displayPreview: String {
        guard preview.count > TerminalQuickCommandConstants.displayPreviewLength else {
            return preview
        }
        return String(preview.prefix(TerminalQuickCommandConstants.displayPreviewLength - 1)) + "…"
    }

    var agentID: String? {
        guard case .agent(let agentID, _) = action else { return nil }
        return agentID
    }

    func isVisible(repoID: String?) -> Bool {
        switch scope {
        case .global: true
        case .repository(let commandRepoID): commandRepoID == repoID
        }
    }

    var wire: MobileQuickCommandWire {
        let scopeWire: MobileQuickCommandScopeWire
        switch scope {
        case .global:
            scopeWire = MobileQuickCommandScopeWire(type: "global", repoId: nil)
        case .repository(let repoID):
            scopeWire = MobileQuickCommandScopeWire(type: "repo", repoId: repoID)
        }
        switch action {
        case .terminal(let command, let appendEnter):
            return MobileQuickCommandWire(
                id: id,
                label: label,
                action: "terminal-command",
                command: command,
                appendEnter: appendEnter,
                agent: nil,
                prompt: nil,
                scope: scopeWire
            )
        case .agent(let agentID, let prompt):
            return MobileQuickCommandWire(
                id: id,
                label: label,
                action: "agent-prompt",
                command: nil,
                appendEnter: nil,
                agent: agentID,
                prompt: prompt,
                scope: scopeWire
            )
        }
    }
}

nonisolated let terminalQuickCommandAgents = [
    "claude", "openclaude", "codex", "opencode", "mimo-code", "pi", "omp", "gemini",
    "antigravity", "command-code", "cursor", "droid", "hermes", "copilot", "grok",
]

nonisolated func supportsQuickCommandAgent(_ id: String) -> Bool {
    terminalQuickCommandAgents.contains(id)
}

nonisolated func quickCommandAgentLabel(_ id: String) -> String {
    switch id {
    case "claude": "Claude"
    case "openclaude": "OpenClaude"
    case "codex": "Codex"
    case "opencode": "OpenCode"
    case "mimo-code": "MiMo Code"
    case "pi": "Pi"
    case "omp": "OMP"
    case "gemini": "Gemini"
    case "antigravity": "Antigravity"
    case "command-code": "Command Code"
    case "cursor": "Cursor"
    case "droid": "Droid"
    case "hermes": "Hermes"
    case "copilot": "GitHub Copilot"
    case "grok": "Grok"
    default: id
    }
}

nonisolated func flattenedQuickCommand(_ command: String) -> String {
    command.components(separatedBy: .newlines)
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        .joined(separator: "; ")
}

nonisolated func trimTrailingWhitespace(_ value: String) -> String {
    String(value.reversed().drop(while: { $0.isWhitespace }).reversed())
}
