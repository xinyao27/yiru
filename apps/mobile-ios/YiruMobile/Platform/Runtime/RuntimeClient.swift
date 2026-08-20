import Foundation

actor RuntimeClient: ConnectionDiagnosticsRepository, HomeRuntime, HostConnectionRuntime,
    TerminalSessionRuntime
{
    private let hosts: any HostRepository
    let timeout: Duration
    private let revivalMonitor: ConnectionRevivalMonitor
    private let connectionLogStore = RuntimeConnectionLogStore()
    let terminalClientInstanceID = UUID().uuidString.lowercased()
    private var sessions: [String: ManagedSession] = [:]
    var terminalMultiplexers: [String: ManagedRuntimeTerminalMultiplexer] = [:]
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

    func reconnect(hostID: String) async {
        guard let credential = try? await credential(for: hostID) else { return }
        let session = await session(for: credential)
        await session.forceReconnect()
    }

    func disconnect(hostID: String) async {
        await connectionLogStore.append(
            hostID: hostID,
            level: .info,
            message: "Disconnected by user"
        )
        if let managed = sessions.removeValue(forKey: hostID) {
            await managed.session.shutdown()
        }
        if let terminal = terminalMultiplexers.removeValue(forKey: hostID) {
            await terminal.multiplexer.shutdown()
        }
        snapshots.removeValue(forKey: hostID)
        for subscription in snapshotSubscriptions.values
        where subscription.hostIDs.contains(hostID) {
            subscription.continuation.yield(
                filteredSnapshots(hostIDs: subscription.hostIDs)
            )
        }
        if primaryHostID == hostID {
            primaryHostID = nil
            primaryHostName = nil
            homeContinuations.values.forEach { $0.yield(.unpaired) }
        }
    }

    func connectionDiagnostics(for hostID: String) async throws
        -> AsyncStream<ConnectionDiagnosticsSnapshot>
    {
        let credential = try await credential(for: hostID)
        let session = await session(for: credential)
        await session.start()
        return await connectionLogStore.updates(hostID: hostID)
    }

    func terminalConnectionContext(for hostID: String) async throws
        -> RuntimeTerminalConnectionContext
    {
        let credential = try await credential(for: hostID)
        return RuntimeTerminalConnectionContext(
            credential: credential,
            controlSession: await session(for: credential),
            clientInstanceID: terminalClientInstanceID
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

    func callRuntime<Input: Encodable & Sendable, Output: Decodable & Sendable>(
        hostID: String,
        path: String,
        input: Input,
        output: Output.Type
    ) async throws -> Output {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).call(path: path, input: input, output: output)
    }

    func probeRuntimeStatusForProtocolCompatibility(hostID: String) async throws
        -> MobileRuntimeStatusWire
    {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).probeStatusForProtocolCompatibility()
    }

    func subscribeRuntime<Input: Encodable & Sendable, Output: Decodable & Sendable>(
        hostID: String,
        path: String,
        input: Input,
        output: Output.Type
    ) async throws -> AsyncThrowingStream<Output, Error> {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).subscribe(
            path: path,
            input: input,
            output: output
        )
    }

    func subscribeRuntimeWithBinary<Input: Encodable & Sendable, Output: Decodable & Sendable>(
        hostID: String,
        path: String,
        input: Input,
        output: Output.Type
    ) async throws -> RuntimeOrpcBinarySubscription<Output> {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).subscribeWithBinary(
            path: path,
            input: input,
            output: output
        )
    }

    private func session(for credential: HostCredential) async -> RuntimeHostSession {
        beginMonitoringNetworkIfNeeded()
        if let managed = sessions[credential.profile.id], managed.credential == credential {
            return managed.session
        }
        if let previous = sessions.removeValue(forKey: credential.profile.id) {
            await previous.session.shutdown()
        }
        if let terminal = terminalMultiplexers.removeValue(forKey: credential.profile.id) {
            await terminal.multiplexer.shutdown()
        }
        let logStore = connectionLogStore
        let session = RuntimeHostSession(
            credential: credential,
            callTimeout: timeout,
            publishSnapshot: { [weak self] snapshot in
                await self?.record(snapshot)
            },
            publishLog: { level, message, detail in
                await logStore.append(
                    hostID: credential.profile.id,
                    level: level,
                    message: message,
                    detail: detail
                )
            }
        )
        sessions[credential.profile.id] = ManagedSession(credential: credential, session: session)
        snapshots[credential.profile.id] = await session.snapshot()
        return session
    }

    private func record(_ snapshot: RuntimeConnectionSnapshot) {
        Task { await connectionLogStore.record(snapshot) }
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
