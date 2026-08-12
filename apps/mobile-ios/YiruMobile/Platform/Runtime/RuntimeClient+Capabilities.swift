import Foundation

extension RuntimeClient: WorkspaceRepository {
    func workspaces(for hostID: String) async throws -> WorkspaceSnapshot {
        try await withThrowingTaskGroup(of: WorkspaceSnapshot.self) { group in
            group.addTask { try await self.fetchWorkspaces(for: hostID) }
            group.addTask {
                try await Task.sleep(for: self.timeout)
                throw WorkspaceRepositoryError.timeout
            }
            guard let snapshot = try await group.next() else { throw CancellationError() }
            group.cancelAll()
            return snapshot
        }
    }

    private func fetchWorkspaces(for hostID: String) async throws -> WorkspaceSnapshot {
        let wire: MobileWorkspaceListWire = try await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.worktreeListPath,
            input: MobileWorkspaceListRequestWire(limit: 10_000),
            output: MobileWorkspaceListWire.self
        )
        return WorkspaceSnapshot(
            workspaces: wire.worktrees.map(WorkspaceSummary.init(wire:)),
            totalCount: wire.totalCount,
            isTruncated: wire.truncated
        )
    }
}

extension RuntimeClient: TerminalRepository {
    func terminals(for hostID: String, worktreeID: String) async throws -> TerminalSnapshot {
        try await withThrowingTaskGroup(of: TerminalSnapshot.self) { group in
            group.addTask { try await self.fetchTerminals(for: hostID, worktreeID: worktreeID) }
            group.addTask {
                try await Task.sleep(for: self.timeout)
                throw TerminalRepositoryError.timeout
            }
            guard let snapshot = try await group.next() else { throw CancellationError() }
            group.cancelAll()
            return snapshot
        }
    }

    func reconnectTerminalHost(hostID: String) async {
        await reconnect(hostID: hostID)
    }

    private func fetchTerminals(for hostID: String, worktreeID: String) async throws
        -> TerminalSnapshot
    {
        let wire: MobileTerminalListWire = try await callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.listPath,
            input: MobileTerminalListRequestWire(
                worktree: "id:\(worktreeID)",
                limit: 1_000,
                requireFreshPtyLiveness: true
            ),
            output: MobileTerminalListWire.self
        )
        return TerminalSnapshot(
            terminals: wire.terminals.map(TerminalSummary.init(wire:)),
            totalCount: wire.totalCount,
            isTruncated: wire.truncated
        )
    }
}

extension RuntimeClient: TerminalDisplayModeRuntime {
    func setTerminalDisplayMode(
        hostID: String,
        terminalID: String,
        mode: TerminalDisplayMode,
        viewport: TerminalGridSize?
    ) async throws -> TerminalDisplayMode {
        let wire: MobileTerminalSetDisplayModeResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.setDisplayModePath,
            input: MobileTerminalSetDisplayModeRequestWire(
                terminal: terminalID,
                mode: mode == .auto ? .auto : .desktop,
                client: MobileTerminalDisplayModeClientWire(
                    id: terminalClientInstanceID,
                    type: .mobile
                ),
                viewport: viewport.map {
                    MobileTerminalDisplayModeViewportWire(cols: $0.columns, rows: $0.rows)
                }
            ),
            output: MobileTerminalSetDisplayModeResultWire.self
        )
        switch wire.mode {
        case .auto: return .auto
        case .desktop: return .desktop
        }
    }
}
