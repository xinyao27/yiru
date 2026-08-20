import Foundation

nonisolated struct NativeChatProviderSession: Hashable, Sendable {
    let id: String
    let transcriptPath: String?
}

nonisolated struct NativeChatAgentStatus: Hashable, Sendable {
    let state: String
    let paneKey: String?
    let prompt: String?
    let updatedAt: Double?
    let stateStartedAt: Double?
    let agent: String?
    let interactivePrompt: String?
    let lastAssistantMessage: String?
    let toolName: String?
    let toolInput: String?
    let isInterrupted: Bool
    let providerSession: NativeChatProviderSession?

    var isWorking: Bool { state == "working" }
    var isWaiting: Bool { state == "blocked" || state == "waiting" }

    var interruptBaseline: TerminalAgentInterruptBaseline? {
        guard isWorking, let paneKey, let prompt, let updatedAt, let stateStartedAt else {
            return nil
        }
        return TerminalAgentInterruptBaseline(
            paneKey: paneKey,
            updatedAt: updatedAt,
            stateStartedAt: stateStartedAt,
            prompt: prompt,
            agentType: agent
        )
    }
}

nonisolated extension TerminalWorkspaceTab {
    var nativeChatAgent: String? {
        let candidate = agentStatus?.agent ?? resolvedAgentType ?? launchAgent
        guard let candidate, ["claude", "openclaude", "codex", "grok"].contains(candidate) else {
            return nil
        }
        return candidate
    }

    var canShowNativeChat: Bool {
        nativeChatAgent != nil && terminalTarget != nil
    }
}
