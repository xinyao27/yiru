import Foundation

extension RuntimeClient: AgentHistoryRepository {
    func supportsAgentHistory(for hostID: String) async throws -> Bool {
        let status: MobileRuntimeStatusWire = try await callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.statusPath,
            input: RuntimeNullWire(),
            output: MobileRuntimeStatusWire.self
        )
        return status.capabilities?.contains(MobileAgentHistoryWireContract.capability) == true
    }

    func agentHistory(
        for hostID: String,
        scopePaths: [String],
        force: Bool
    ) async throws -> AgentHistorySnapshot {
        guard try await supportsAgentHistory(for: hostID) else {
            throw AgentHistoryRepositoryError.unsupported
        }
        let wire: MobileAgentHistoryResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileAgentHistoryWireContract.listPath,
            input: MobileAgentHistoryListRequestWire(
                // Why: a 500-session recency window. The compact projection trims preview/usage
                // payloads before E2EE so the larger result stays below URLSession's frame
                // limit.
                limit: 500,
                force: force,
                compact: true,
                scopePaths: scopePaths.isEmpty ? nil : scopePaths
            ),
            output: MobileAgentHistoryResultWire.self
        )
        return AgentHistorySnapshot(
            sessions: wire.sessions.map(AgentHistorySession.init(wire:)),
            issues: wire.issues.map {
                AgentHistoryIssue(agent: $0.agent, path: $0.path, message: $0.message)
            }
        )
    }

    func resumeAgentHistorySession(
        for hostID: String,
        workspace: WorkspaceSummary,
        session: AgentHistorySession,
        mutationID: String
    ) async throws {
        async let statusResult: MobileRuntimeStatusWire = callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.statusPath,
            input: RuntimeNullWire(),
            output: MobileRuntimeStatusWire.self
        )
        async let settingsResult: MobileWorkspaceRuntimeSettingsEnvelopeWire? = try? callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.settingsGetPath,
            input: RuntimeNullWire(),
            output: MobileWorkspaceRuntimeSettingsEnvelopeWire.self
        )
        let (status, settingsEnvelope) = try await (statusResult, settingsResult)
        let settings = settingsEnvelope?.settings
        let launch = try AgentHistoryResumeLaunchBuilder.build(
            session: session,
            workspace: workspace,
            status: status,
            settings: AgentHistoryResumeSettings(
                commandOverrides: settings?.agentCmdOverrides ?? [:],
                defaultArguments: settings?.agentDefaultArgs ?? [:],
                defaultEnvironment: settings?.agentDefaultEnv ?? [:]
            )
        )
        let command = launch.command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !command.isEmpty else { throw AgentHistoryRepositoryError.invalidResumeCommand }
        let wire: MobileSessionCreateTerminalResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.createTerminalPath,
            input: MobileSessionCreateTerminalRequestWire(
                worktree: "id:\(workspace.id)",
                afterTabId: nil,
                activate: true,
                clientMutationId: mutationID,
                agent: nil,
                command: nil,
                env: launch.environment,
                envToDelete: launch.environmentToDelete,
                launchConfig: launch.launchConfig,
                launchAgent: launch.launchAgent,
                startupCommandDelivery: nil,
                agentPrompt: nil
            ),
            output: MobileSessionCreateTerminalResultWire.self
        )
        guard let terminalID = wire.tab.terminal else {
            throw AgentHistoryRepositoryError.rejectedResume
        }
        let sent: MobileQuickCommandTerminalSendResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileQuickCommandsWireContract.terminalSendPath,
            input: MobileQuickCommandTerminalSendRequestWire(
                terminal: terminalID,
                text: command,
                enter: true
            ),
            output: MobileQuickCommandTerminalSendResultWire.self
        )
        guard sent.send.accepted, sent.send.handle == terminalID else {
            throw AgentHistoryRepositoryError.rejectedResume
        }
    }
}
