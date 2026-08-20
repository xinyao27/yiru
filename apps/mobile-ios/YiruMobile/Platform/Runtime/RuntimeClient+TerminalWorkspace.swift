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

    func workspaceDisplayName(for hostID: String, worktreeID: String) async throws -> String? {
        try await workspaces(for: hostID).workspaces.first { $0.id == worktreeID }?.name
    }

    func workspaceInvalidations(for hostID: String) async throws
        -> AsyncThrowingStream<TerminalWorkspaceInvalidation, Error>
    {
        let source = try await subscribeRuntime(
            hostID: hostID,
            path: MobileClientEventsWireContract.subscribePath,
            input: RuntimeVoidInput(),
            output: MobileClientEventWire.self
        )
        let (stream, continuation) = AsyncThrowingStream.makeStream(
            of: TerminalWorkspaceInvalidation.self
        )
        let forwardingTask = Task {
            do {
                for try await event in source {
                    switch event {
                    case .ready:
                        continuation.yield(.ready)
                    case .reposChanged:
                        continuation.yield(.repositoriesChanged)
                    case .worktreesChanged(let repoID):
                        continuation.yield(.worktreesChanged(repoID: repoID))
                    case .ignored:
                        continue
                    case .end:
                        continuation.yield(.end)
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
        leafID: String?,
        terminalID: String?
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
        if let terminalID {
            // Why: Desktop keeps terminal input focus separate from the workspace-tab
            // activation RPC, so focus the selected PTY after the authoritative tab mutation —
            // and keep a successful tab switch usable if a stale/retired handle races this
            // best-effort focus request.
            try? await focusTerminal(hostID: hostID, terminalID: terminalID)
        }
        return await mapWorkspaceSnapshot(wire, hostID: hostID, worktreeID: worktreeID)
    }

    func createWorkspaceTerminal(
        for hostID: String,
        worktreeID: String,
        afterTabID: String?,
        agentID: String?
    ) async throws -> TerminalWorkspaceSnapshot {
        let current = try await fetchWorkspaceTabs(for: hostID, worktreeID: worktreeID)
        let created: MobileSessionCreateTerminalResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.createTerminalPath,
            input: MobileSessionCreateTerminalRequestWire(
                worktree: worktreeSelector(worktreeID),
                afterTabId: afterTabID,
                activate: true,
                clientMutationId: UUID().uuidString.lowercased(),
                agent: agentID,
                command: nil,
                env: nil,
                envToDelete: nil,
                launchConfig: nil,
                launchAgent: nil,
                startupCommandDelivery: nil,
                agentPrompt: nil
            ),
            output: MobileSessionCreateTerminalResultWire.self
        )
        let createdSnapshot = workspaceSnapshotAfterCreatingTerminal(
            current: current,
            created: created,
            worktreeID: worktreeID,
            afterTabID: afterTabID
        )
        guard let createdTab = createdSnapshot.tabs.first(where: { $0.id == created.tab.id }) else {
            return createdSnapshot
        }
        do {
            let activated = try await activateWorkspaceTab(
                for: hostID,
                worktreeID: worktreeID,
                tabID: createdTab.id,
                leafID: createdTab.leafID,
                terminalID: createdTab.terminalTarget?.id
            )
            // Why: the activation RPC can race the publication that adds the new tab. Do not
            // replace the authoritative create response with a stale snapshot that hides it.
            guard
                activated.tabs.contains(where: { $0.id == createdTab.id }),
                activated.activeTabID == createdTab.id
            else { return createdSnapshot }
            return activated
        } catch {
            // Why: creation already succeeded; keep the new tab locally selected if the
            // follow-up mobile-only activation response is lost instead of spawning a duplicate.
            return createdSnapshot
        }
    }

    func createWorkspaceBrowser(
        for hostID: String,
        worktreeID: String,
        url: String
    ) async throws -> TerminalWorkspaceSnapshot {
        let result: MobileBrowserTabCreateResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.browserTabCreatePath,
            input: MobileBrowserTabCreateRequestWire(
                worktree: worktreeSelector(worktreeID),
                url: url,
                activate: true
            ),
            output: MobileBrowserTabCreateResultWire.self
        )
        var latestSnapshot: TerminalWorkspaceSnapshot?
        for delay in [100, 300, 800, 1_200] {
            try await Task.sleep(for: .milliseconds(delay))
            let snapshot = try await fetchWorkspaceTabs(for: hostID, worktreeID: worktreeID)
            latestSnapshot = snapshot
            if snapshot.tabs.contains(where: { tab in
                guard case .browser(let browser) = tab.content else { return false }
                return browser.pageID == result.browserPageId
            }) {
                return snapshot
            }
        }
        // Why: Desktop publishes the tab before its browser page registration settles. Return
        // after tabCreate and let the normal tab subscription/poll promote the pending tab —
        // treating that short registration window as a mutation failure reports a successful
        // tab creation as an error and hides the recoverable pending surface.
        if let latestSnapshot { return latestSnapshot }
        throw TerminalWorkspaceRepositoryError.rejectedMutation
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
}
