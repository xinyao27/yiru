import Foundation

actor RuntimeClient: HomeRuntime, HostConnectionRuntime, TerminalRepository, WorkspaceRepository {
    private let hosts: any HostRepository
    private let timeout: Duration
    private let revivalMonitor: ConnectionRevivalMonitor
    private var sessions: [String: ManagedSession] = [:]
    private var snapshots: [String: RuntimeConnectionSnapshot] = [:]
    private var homeContinuations: [UUID: AsyncStream<RuntimeConnectionState>.Continuation] = [:]
    private var snapshotSubscriptions: [UUID: SnapshotSubscription] = [:]
    private var primaryHostID: String?
    private var primaryHostName: String?
    private var isMonitoringNetwork = false

    init(
        hosts: any HostRepository,
        timeout: Duration = .seconds(25),
        revivalMonitor: ConnectionRevivalMonitor = ConnectionRevivalMonitor()
    ) {
        self.hosts = hosts
        self.timeout = timeout
        self.revivalMonitor = revivalMonitor
    }

    func currentConnectionState() async -> RuntimeConnectionState {
        guard let credential = try? await primaryCredential() else { return .unpaired }
        let session = await session(for: credential)
        await session.start()
        return map(await session.snapshot())
    }

    func connectionStates() -> AsyncStream<RuntimeConnectionState> {
        let id = UUID()
        let (stream, continuation) = AsyncStream.makeStream(
            of: RuntimeConnectionState.self,
            bufferingPolicy: .bufferingNewest(1)
        )
        homeContinuations[id] = continuation
        continuation.yield(currentHomeState())
        continuation.onTermination = { [weak self] _ in
            Task { await self?.removeHomeContinuation(id) }
        }
        return stream
    }

    func reconnectMostRecentHost() async {
        guard let credential = try? await primaryCredential() else { return }
        let session = await session(for: credential)
        await session.forceReconnect()
    }

    func connectionSnapshots(forHostIDs hostIDs: [String]) async -> AsyncStream<
        [String: RuntimeConnectionSnapshot]
    > {
        let id = UUID()
        let hostIDs = Set(hostIDs)
        let (stream, continuation) = AsyncStream.makeStream(
            of: [String: RuntimeConnectionSnapshot].self,
            bufferingPolicy: .bufferingNewest(1)
        )
        snapshotSubscriptions[id] = SnapshotSubscription(
            hostIDs: hostIDs,
            continuation: continuation
        )
        continuation.onTermination = { [weak self] _ in
            Task { await self?.removeSnapshotSubscription(id) }
        }

        for hostID in hostIDs {
            guard let credential = try? await credential(for: hostID) else { continue }
            let session = await session(for: credential)
            await session.start()
        }
        continuation.yield(filteredSnapshots(hostIDs: hostIDs))
        return stream
    }

    func applicationDidBecomeActive() async {
        await reviveConnections()
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

    func reconnect(hostID: String) async {
        guard let credential = try? await credential(for: hostID) else { return }
        let session = await session(for: credential)
        await session.forceReconnect()
    }

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

    private func fetchWorkspaces(for hostID: String) async throws -> WorkspaceSnapshot {
        let credential = try await credential(for: hostID)
        let session = await session(for: credential)
        let wire: MobileWorkspaceListWire = try await session.call(
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

    private func fetchTerminals(for hostID: String, worktreeID: String) async throws
        -> TerminalSnapshot
    {
        let credential = try await credential(for: hostID)
        let session = await session(for: credential)
        let wire: MobileTerminalListWire = try await session.call(
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

    private func primaryCredential() async throws -> HostCredential {
        guard
            let profile = try await hosts.hosts().sorted(by: {
                $0.lastConnected > $1.lastConnected
            }).first,
            let credential = try await hosts.credential(for: profile.id)
        else {
            primaryHostID = nil
            primaryHostName = nil
            throw RuntimeClientError.hostNotFound
        }
        primaryHostID = profile.id
        primaryHostName = profile.name
        return credential
    }

    private func credential(for hostID: String) async throws -> HostCredential {
        guard let credential = try await hosts.credential(for: hostID) else {
            throw WorkspaceRepositoryError.hostNotFound
        }
        return credential
    }

    private func session(for credential: HostCredential) async -> RuntimeHostSession {
        beginMonitoringNetworkIfNeeded()
        if let managed = sessions[credential.profile.id], managed.credential == credential {
            return managed.session
        }
        if let previous = sessions.removeValue(forKey: credential.profile.id) {
            await previous.session.shutdown()
        }
        let session = RuntimeHostSession(credential: credential) { [weak self] snapshot in
            await self?.record(snapshot)
        }
        sessions[credential.profile.id] = ManagedSession(credential: credential, session: session)
        snapshots[credential.profile.id] = await session.snapshot()
        return session
    }

    private func record(_ snapshot: RuntimeConnectionSnapshot) {
        snapshots[snapshot.hostID] = snapshot
        for subscription in snapshotSubscriptions.values
        where subscription.hostIDs.contains(snapshot.hostID) {
            subscription.continuation.yield(
                filteredSnapshots(hostIDs: subscription.hostIDs)
            )
        }
        guard snapshot.hostID == primaryHostID else { return }
        let state = map(snapshot)
        homeContinuations.values.forEach { $0.yield(state) }
    }

    private func currentHomeState() -> RuntimeConnectionState {
        guard let primaryHostID, let primaryHostName else { return .unpaired }
        guard let snapshot = snapshots[primaryHostID] else {
            return .paired(hostName: primaryHostName)
        }
        return map(snapshot)
    }

    private func map(_ snapshot: RuntimeConnectionSnapshot) -> RuntimeConnectionState {
        switch snapshot.phase {
        case .idle:
            .paired(hostName: snapshot.hostName)
        case .connecting:
            .connecting(hostName: snapshot.hostName)
        case .connected:
            .connected(hostName: snapshot.hostName)
        case .reconnecting:
            .reconnecting(
                hostName: snapshot.hostName,
                reconnectAttempt: snapshot.reconnectAttempt
            )
        case .unreachable:
            .unavailable(
                hostName: snapshot.hostName,
                reconnectAttempt: snapshot.reconnectAttempt
            )
        case .authenticationFailed:
            .authenticationFailed(hostName: snapshot.hostName)
        }
    }

    private func beginMonitoringNetworkIfNeeded() {
        guard !isMonitoringNetwork else { return }
        isMonitoringNetwork = true
        revivalMonitor.start { [weak self] in
            Task { await self?.reviveConnections() }
        }
    }

    private func reviveConnections() async {
        for managed in sessions.values {
            await managed.session.revive()
        }
    }

    private func removeHomeContinuation(_ id: UUID) {
        homeContinuations.removeValue(forKey: id)
    }

    private func removeSnapshotSubscription(_ id: UUID) {
        snapshotSubscriptions.removeValue(forKey: id)
    }

    private func filteredSnapshots(hostIDs: Set<String>) -> [String: RuntimeConnectionSnapshot] {
        snapshots.filter { hostIDs.contains($0.key) }
    }
}

nonisolated private struct ManagedSession: Sendable {
    let credential: HostCredential
    let session: RuntimeHostSession
}

nonisolated private struct SnapshotSubscription: Sendable {
    let hostIDs: Set<String>
    let continuation: AsyncStream<[String: RuntimeConnectionSnapshot]>.Continuation
}

nonisolated private enum RuntimeClientError: Error {
    case hostNotFound
}
