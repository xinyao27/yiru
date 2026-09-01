import Foundation

nonisolated struct MobileWorkspaceListUIStateWire: Decodable, Sendable {
    let sortBy: String?
    let hideSleepingWorkspaces: Bool?
    let hideDefaultBranchWorkspace: Bool?
    let filterRepoIds: [String]?
    let collapsedGroups: [String]?
}

nonisolated struct MobileWorkspaceListUIResultWire: Decodable, Sendable {
    let ui: MobileWorkspaceListUIStateWire
}

nonisolated struct MobileWorkspaceListUISetRequestWire: Encodable, Sendable {
    let collapsedGroups: [String]
}

extension RuntimeClient: WorkspaceRepository {
    func workspaceHostCompatibility(for hostID: String) async -> WorkspaceHostCompatibility? {
        let status: MobileRuntimeStatusWire
        do {
            status = try await runtimeStatus(for: hostID, timeout: .seconds(4))
        } catch {
            guard
                let fallback = try? await legacyRuntimeStatus(
                    for: hostID,
                    timeout: .seconds(5)
                )
            else { return nil }
            status = fallback
        }

        let desktopVersion = status.runtimeProtocolVersion ?? status.protocolVersion ?? 0
        let requiredMobileVersion =
            status.minCompatibleRuntimeClientVersion ?? status.minCompatibleMobileVersion ?? 0
        if MobileTerminalWireContract.runtimeProtocolVersion < requiredMobileVersion {
            return .mobileTooOld(requiredVersion: requiredMobileVersion)
        }
        if desktopVersion < MobileTerminalWireContract.minimumCompatibleRuntimeServerVersion {
            return .desktopTooOld(
                requiredVersion: MobileTerminalWireContract.minimumCompatibleRuntimeServerVersion
            )
        }
        return .compatible
    }

    func workspaceListViewSettings(for hostID: String) async throws -> WorkspaceListViewSettings {
        let result: MobileWorkspaceListUIResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileWorkspaceCreationWireContract.uiGetPath,
            input: RuntimeVoidInput(),
            output: MobileWorkspaceListUIResultWire.self
        )
        return WorkspaceListViewSettings(
            sortMode: result.ui.sortBy.flatMap(WorkspaceListSortMode.init(rawValue:)) ?? .recent,
            hideSleeping: result.ui.hideSleepingWorkspaces ?? false,
            hideDefaultBranch: result.ui.hideDefaultBranchWorkspace ?? false,
            filterRepoIDs: Set(result.ui.filterRepoIds ?? []),
            collapsedGroups: Set(result.ui.collapsedGroups ?? [])
        )
    }

    func setWorkspaceCollapsedGroups(hostID: String, groups: Set<String>) async throws {
        let _: MobileWorkspaceListUIResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileWorkspaceCreationWireContract.uiSetPath,
            input: MobileWorkspaceListUISetRequestWire(collapsedGroups: groups.sorted()),
            output: MobileWorkspaceListUIResultWire.self
        )
    }

    private func runtimeStatus(for hostID: String, timeout: Duration) async throws
        -> MobileRuntimeStatusWire
    {
        try await withThrowingTaskGroup(of: MobileRuntimeStatusWire.self) { group in
            group.addTask {
                try await self.callRuntime(
                    hostID: hostID,
                    path: MobileTerminalWireContract.statusPath,
                    input: RuntimeVoidInput(),
                    output: MobileRuntimeStatusWire.self
                )
            }
            group.addTask {
                try await Task.sleep(for: timeout)
                throw WorkspaceRepositoryError.timeout
            }
            guard let status = try await group.next() else { throw CancellationError() }
            group.cancelAll()
            return status
        }
    }

    private func legacyRuntimeStatus(for hostID: String, timeout: Duration) async throws
        -> MobileRuntimeStatusWire
    {
        try await withThrowingTaskGroup(of: MobileRuntimeStatusWire.self) { group in
            group.addTask {
                try await self.probeRuntimeStatusForProtocolCompatibility(hostID: hostID)
            }
            group.addTask {
                try await Task.sleep(for: timeout)
                throw WorkspaceRepositoryError.timeout
            }
            guard let status = try await group.next() else { throw CancellationError() }
            group.cancelAll()
            return status
        }
    }

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

    func allWorkspaceTabUpdates(for hostID: String) async throws
        -> AsyncThrowingStream<[String: [WorkspaceOpenTab]], Error>
    {
        let (stream, continuation) = AsyncThrowingStream.makeStream(
            of: [String: [WorkspaceOpenTab]].self
        )
        let forwardingTask = Task {
            var tabsByWorkspace: [String: [WorkspaceOpenTab]] = [:]
            do {
                // Why: a cold connection can spend a visible frame establishing the snapshots
                // stream, so hydrate from listAll first and let the stream stay the
                // authoritative source for subsequent updates.
                if let initial: MobileSessionTabsListAllWire = try? await self.callRuntime(
                    hostID: hostID,
                    path: MobileSessionTabsWireContract.listAllPath,
                    input: RuntimeVoidInput(),
                    output: MobileSessionTabsListAllWire.self
                ) {
                    for snapshot in initial.snapshots {
                        tabsByWorkspace[snapshot.worktree] = mapOpenTabs(snapshot.tabs)
                    }
                    continuation.yield(tabsByWorkspace)
                }

                let source = try await self.subscribeRuntime(
                    hostID: hostID,
                    path: MobileSessionTabsWireContract.subscribeAllPath,
                    input: RuntimeVoidInput(),
                    output: MobileSessionTabsAllEventWire.self
                )
                for try await event in source {
                    switch event {
                    case .snapshots(let snapshots):
                        tabsByWorkspace.removeAll(keepingCapacity: true)
                        for snapshot in snapshots {
                            tabsByWorkspace[snapshot.worktree] = mapOpenTabs(snapshot.tabs)
                        }
                        continuation.yield(tabsByWorkspace)
                    case .updated(let snapshot):
                        tabsByWorkspace[snapshot.worktree] = mapOpenTabs(snapshot.tabs)
                        continuation.yield(tabsByWorkspace)
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

    func activateWorkspace(hostID: String, workspaceID: String) async throws {
        let result: MobileWorkspaceActivateResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.worktreeActivatePath,
            input: MobileWorkspaceActivateRequestWire(
                worktree: worktreeSelector(workspaceID),
                notifyClients: false
            ),
            output: MobileWorkspaceActivateResultWire.self
        )
        guard result.activated else { throw WorkspaceRepositoryError.rejectedMutation }
    }

    func selectWorkspaceTab(
        hostID: String,
        workspaceID: String,
        tab: WorkspaceOpenTab
    ) async throws {
        _ = try await activateWorkspaceTab(
            for: hostID,
            worktreeID: workspaceID,
            tabID: tab.id,
            leafID: tab.kind == .terminal ? tab.leafID : nil,
            terminalID: tab.terminalID
        )
    }

    func sleepWorkspace(hostID: String, workspaceID: String) async throws {
        let result: MobileWorkspaceSleepResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.worktreeSleepPath,
            input: MobileWorkspaceSelectorRequestWire(worktree: worktreeSelector(workspaceID)),
            output: MobileWorkspaceSleepResultWire.self
        )
        guard result.worktreeId == workspaceID else {
            throw WorkspaceRepositoryError.rejectedMutation
        }
    }

    func setWorkspacePinned(hostID: String, workspaceID: String, isPinned: Bool) async throws {
        let revision = try await workspaceMutationRevision(hostID: hostID, workspaceID: workspaceID)
        let _: MobileWorkspacePinResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.worktreeSetPath,
            input: MobileWorkspacePinRequestWire(
                worktree: worktreeSelector(workspaceID),
                expectedRevision: revision,
                isPinned: isPinned
            ),
            output: MobileWorkspacePinResultWire.self
        )
    }

    func removeWorkspace(hostID: String, workspaceID: String) async throws {
        let revision = try await workspaceMutationRevision(hostID: hostID, workspaceID: workspaceID)
        let result: MobileWorkspaceRemoveResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.worktreeRemovePath,
            input: MobileWorkspaceRemoveRequestWire(
                worktree: worktreeSelector(workspaceID),
                expectedRevision: revision,
                force: true,
                runHooks: nil
            ),
            output: MobileWorkspaceRemoveResultWire.self
        )
        guard result.removed else { throw WorkspaceRepositoryError.rejectedMutation }
    }

    func workspaceMutationRevision(hostID: String, workspaceID: String) async throws -> Int {
        let result: MobileWorktreeShowResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.worktreeShowPath,
            input: MobileWorktreeShowRequestWire(worktree: worktreeSelector(workspaceID)),
            output: MobileWorktreeShowResultWire.self
        )
        guard let revision = result.revision else {
            throw WorkspaceRepositoryError.rejectedMutation
        }
        return revision
    }

    func fetchWorkspaces(for hostID: String) async throws -> WorkspaceSnapshot {
        async let repos = fetchWorkspaceRepos(for: hostID)
        let wire: MobileWorkspaceListWire = try await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.worktreeListPath,
            input: MobileWorkspaceListRequestWire(limit: 10_000),
            output: MobileWorkspaceListWire.self
        )
        return WorkspaceSnapshot(
            workspaces: wire.worktrees.map(WorkspaceSummary.init(wire:)),
            repos: await repos,
            totalCount: wire.totalCount,
            isTruncated: wire.truncated
        )
    }

    func fetchWorkspaceRepos(for hostID: String) async -> [WorkspaceRepo] {
        let wire: MobileRepoListWire? = try? await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.repoListPath,
            input: RuntimeVoidInput(),
            output: MobileRepoListWire.self
        )
        return wire?.repos.map(WorkspaceRepo.init(wire:)) ?? []
    }

    func worktreeSelector(_ workspaceID: String) -> String {
        "id:\(workspaceID)"
    }
}
