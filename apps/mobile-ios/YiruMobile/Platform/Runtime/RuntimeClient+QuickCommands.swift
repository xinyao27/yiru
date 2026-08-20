import Foundation

extension RuntimeClient: TerminalQuickCommandRepository {
    func supportsQuickCommands(for hostID: String) async throws -> Bool {
        let status: MobileRuntimeStatusWire = try await callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.statusPath,
            input: RuntimeNullWire(),
            output: MobileRuntimeStatusWire.self
        )
        return status.capabilities?.contains(MobileQuickCommandsWireContract.capability) == true
    }

    func quickCommands(for hostID: String) async throws -> [TerminalQuickCommand] {
        guard try await supportsQuickCommands(for: hostID) else {
            throw TerminalQuickCommandRepositoryError.unsupported
        }
        let result: MobileQuickCommandsResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileQuickCommandsWireContract.getPath,
            input: RuntimeNullWire(),
            output: MobileQuickCommandsResultWire.self
        )
        guard result.terminalQuickCommands.count <= 40 else {
            throw TerminalQuickCommandRepositoryError.invalidResponse
        }
        let commands = result.terminalQuickCommands.compactMap(TerminalQuickCommand.init(wire:))
        guard commands.count == result.terminalQuickCommands.count,
            Set(commands.map(\.id)).count == commands.count
        else { throw TerminalQuickCommandRepositoryError.invalidResponse }
        return commands
    }

    func mutateQuickCommands(
        for hostID: String,
        mutation: TerminalQuickCommandMutation
    ) async throws -> [TerminalQuickCommand] {
        let wire: MobileQuickCommandMutationWire
        switch mutation {
        case .upsert(let command):
            wire = MobileQuickCommandMutationWire(
                type: "upsert", command: command.wire, id: nil)
        case .delete(let id):
            wire = MobileQuickCommandMutationWire(type: "delete", command: nil, id: id)
        }
        let result: MobileQuickCommandsResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileQuickCommandsWireContract.updatePath,
            input: MobileQuickCommandUpdateRequestWire(mutation: wire),
            output: MobileQuickCommandsResultWire.self
        )
        guard result.terminalQuickCommands.count <= 40 else {
            throw TerminalQuickCommandRepositoryError.invalidResponse
        }
        let commands = result.terminalQuickCommands.compactMap(TerminalQuickCommand.init(wire:))
        guard commands.count == result.terminalQuickCommands.count else {
            throw TerminalQuickCommandRepositoryError.invalidResponse
        }
        return commands
    }

    func launchQuickCommand(
        for hostID: String,
        worktreeID: String,
        afterTabID: String?,
        command: TerminalQuickCommand
    ) async throws -> TerminalWorkspaceSnapshot {
        let current = try await workspaceTabs(for: hostID, worktreeID: worktreeID)
        let agent: String?
        let startupCommand: String?
        let delivery: String?
        let agentPrompt: String?
        switch command.action {
        case .terminal(let value, let appendEnter):
            agent = nil
            startupCommand = appendEnter ? flattenedQuickCommand(value) : nil
            delivery = appendEnter ? "shell-ready" : nil
            agentPrompt = nil
        case .agent(let agentID, let prompt):
            agent = agentID
            startupCommand = nil
            delivery = nil
            agentPrompt = prompt
        }
        let created: MobileSessionCreateTerminalResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.createTerminalPath,
            input: MobileSessionCreateTerminalRequestWire(
                worktree: "id:\(worktreeID)",
                afterTabId: afterTabID,
                activate: true,
                clientMutationId: "quick-command:\(UUID().uuidString.lowercased())",
                agent: agent,
                command: startupCommand,
                env: nil,
                envToDelete: nil,
                launchConfig: nil,
                launchAgent: nil,
                startupCommandDelivery: delivery,
                agentPrompt: agentPrompt
            ),
            output: MobileSessionCreateTerminalResultWire.self
        )
        guard let terminal = created.tab.terminal else {
            throw TerminalQuickCommandRepositoryError.rejectedLaunch
        }
        if case .terminal(let value, false) = command.action {
            let sent: MobileQuickCommandTerminalSendResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileQuickCommandsWireContract.terminalSendPath,
                input: MobileQuickCommandTerminalSendRequestWire(
                    terminal: terminal,
                    text: value,
                    enter: false
                ),
                output: MobileQuickCommandTerminalSendResultWire.self
            )
            guard sent.send.accepted, sent.send.handle == terminal else {
                throw TerminalQuickCommandRepositoryError.rejectedLaunch
            }
        }
        // Why: the create response is authoritative for the new tab, while an immediate list
        // response can still be one publication behind the Desktop runtime. Merge the created
        // tab into the last known snapshot so the command opens visibly and remains selected.
        return workspaceSnapshotAfterCreatingTerminal(
            current: current,
            created: created,
            worktreeID: worktreeID,
            afterTabID: afterTabID
        )
    }
}
