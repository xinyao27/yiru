import Foundation

extension RuntimeClient: TerminalWorkspaceRepository {
    func workspaceTabs(for hostID: String, worktreeID: String) async throws
        -> TerminalWorkspaceSnapshot
    {
        try await withThrowingTaskGroup(of: TerminalWorkspaceSnapshot.self) { group in
            group.addTask {
                try await self.fetchWorkspaceTabs(for: hostID, worktreeID: worktreeID)
            }
            group.addTask {
                try await Task.sleep(for: self.timeout)
                throw TerminalWorkspaceRepositoryError.timeout
            }
            guard let snapshot = try await group.next() else { throw CancellationError() }
            group.cancelAll()
            return snapshot
        }
    }

    func workspaceTabUpdates(for hostID: String, worktreeID: String) async throws
        -> AsyncThrowingStream<TerminalWorkspaceSnapshot, Error>
    {
        let source = try await subscribeRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.subscribePath,
            input: MobileSessionTabsWorktreeRequestWire(worktree: worktreeSelector(worktreeID)),
            output: MobileSessionTabsEventWire.self
        )
        let (stream, continuation) = AsyncThrowingStream.makeStream(
            of: TerminalWorkspaceSnapshot.self
        )
        let forwardingTask = Task {
            do {
                for try await event in source {
                    switch event {
                    case .snapshot(let wire), .updated(let wire):
                        continuation.yield(
                            await mapWorkspaceSnapshot(
                                wire,
                                hostID: hostID,
                                worktreeID: worktreeID
                            )
                        )
                    case .end:
                        continuation.finish()
                        return
                    }
                }
                continuation.finish()
            } catch is CancellationError {
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in forwardingTask.cancel() }
        return stream
    }

    func activateWorkspaceTab(
        for hostID: String,
        worktreeID: String,
        tabID: String,
        leafID: String?
    ) async throws -> TerminalWorkspaceSnapshot {
        let wire: MobileSessionTabsWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.activatePath,
            input: MobileSessionTabMutationRequestWire(
                worktree: worktreeSelector(worktreeID),
                tabId: tabID,
                leafId: leafID,
                notifyClients: false
            ),
            output: MobileSessionTabsWire.self
        )
        return await mapWorkspaceSnapshot(wire, hostID: hostID, worktreeID: worktreeID)
    }

    func createWorkspaceTerminal(
        for hostID: String,
        worktreeID: String,
        afterTabID: String?
    ) async throws -> TerminalWorkspaceSnapshot {
        let _: MobileSessionCreateTerminalResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.createTerminalPath,
            input: MobileSessionCreateTerminalRequestWire(
                worktree: worktreeSelector(worktreeID),
                afterTabId: afterTabID,
                activate: true,
                clientMutationId: UUID().uuidString.lowercased()
            ),
            output: MobileSessionCreateTerminalResultWire.self
        )
        return try await fetchWorkspaceTabs(for: hostID, worktreeID: worktreeID)
    }

    func closeWorkspaceTab(
        for hostID: String,
        worktreeID: String,
        tabID: String,
        leafID: String?
    ) async throws -> TerminalWorkspaceSnapshot {
        let result: MobileSessionTabCloseResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.closePath,
            input: MobileSessionTabMutationRequestWire(
                worktree: worktreeSelector(worktreeID),
                tabId: tabID,
                leafId: leafID,
                notifyClients: false
            ),
            output: MobileSessionTabCloseResultWire.self
        )
        guard result.closed else { throw TerminalWorkspaceRepositoryError.rejectedMutation }
        return try await fetchWorkspaceTabs(for: hostID, worktreeID: worktreeID)
    }

    func reconnectWorkspaceHost(hostID: String) async {
        await reconnect(hostID: hostID)
    }

    private func fetchWorkspaceTabs(for hostID: String, worktreeID: String) async throws
        -> TerminalWorkspaceSnapshot
    {
        let wire: MobileSessionTabsWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.listPath,
            input: MobileSessionTabsWorktreeRequestWire(worktree: worktreeSelector(worktreeID)),
            output: MobileSessionTabsWire.self
        )
        return await mapWorkspaceSnapshot(wire, hostID: hostID, worktreeID: worktreeID)
    }

    private func mapWorkspaceSnapshot(
        _ wire: MobileSessionTabsWire,
        hostID: String,
        worktreeID: String
    ) async -> TerminalWorkspaceSnapshot {
        let terminals = try? await fetchTerminalTargets(for: hostID, worktreeID: worktreeID)
        return TerminalWorkspaceSnapshot(
            worktree: wire.worktree,
            publicationEpoch: wire.publicationEpoch,
            snapshotVersion: wire.snapshotVersion,
            activeTabID: wire.activeTabId,
            tabs: wire.tabs.map { mapWorkspaceTab($0, terminals: terminals ?? [:]) }
        )
    }

    private func fetchTerminalTargets(for hostID: String, worktreeID: String) async throws
        -> [String: TerminalTarget]
    {
        let wire: MobileTerminalListWire = try await callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.listPath,
            input: MobileTerminalListRequestWire(
                worktree: worktreeSelector(worktreeID),
                limit: 1_000,
                requireFreshPtyLiveness: true
            ),
            output: MobileTerminalListWire.self
        )
        return Dictionary(
            uniqueKeysWithValues: wire.terminals.map {
                let summary = TerminalSummary(wire: $0)
                return (summary.id, summary.target)
            }
        )
    }

    private func mapWorkspaceTab(
        _ wire: MobileSessionTabWire,
        terminals: [String: TerminalTarget]
    ) -> TerminalWorkspaceTab {
        let content: TerminalWorkspaceTabContent
        switch wire.type {
        case .terminal:
            if wire.status == .ready, let handle = wire.terminal {
                let target =
                    terminals[handle]
                    ?? TerminalTarget(id: handle, title: wire.title, isWritable: true)
                content = .terminal(.ready(target))
            } else {
                content = .terminal(.pending)
            }
        case .markdown:
            content = .markdown(path: wire.relativePath ?? wire.filePath)
        case .file:
            content = .file(path: wire.relativePath ?? wire.filePath)
        case .browser:
            content = .browser(url: wire.url)
        }
        return TerminalWorkspaceTab(
            id: wire.id,
            title: wire.title,
            isActive: wire.isActive,
            isPinned: wire.isPinned ?? false,
            leafID: wire.leafId,
            content: content
        )
    }

    private func worktreeSelector(_ worktreeID: String) -> String {
        "id:\(worktreeID)"
    }
}
