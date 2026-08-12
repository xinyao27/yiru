import Foundation

actor RuntimeHostSession {
    private let credential: HostCredential
    private let policy: RuntimeReconnectPolicy
    private let publishSnapshot: @Sendable (RuntimeConnectionSnapshot) async -> Void

    private var phase: RuntimeConnectionPhase = .idle
    private var reconnectAttempt = 0
    private var authenticationRejections = 0
    private var lastConnectedAt: Date?
    private var connectionGeneration = 0
    private var connectionAttemptGeneration = 0
    private var reconnectGeneration = 0
    private var peer: RuntimeOrpcPeer?
    private var connectTask: Task<RuntimeOrpcPeer, Error>?
    private var reconnectTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var isStopped = false

    init(
        credential: HostCredential,
        policy: RuntimeReconnectPolicy = .mobile,
        publishSnapshot: @escaping @Sendable (RuntimeConnectionSnapshot) async -> Void
    ) {
        self.credential = credential
        self.policy = policy
        self.publishSnapshot = publishSnapshot
    }

    func snapshot() -> RuntimeConnectionSnapshot {
        RuntimeConnectionSnapshot(
            hostID: credential.profile.id,
            hostName: credential.profile.name,
            phase: phase,
            reconnectAttempt: reconnectAttempt,
            lastConnectedAt: lastConnectedAt
        )
    }

    func generation() -> Int {
        connectionGeneration
    }

    func connectedGeneration() async throws -> Int {
        _ = try await connectIfNeeded()
        return connectionGeneration
    }

    func start() async {
        guard !isStopped, phase != .authenticationFailed else { return }
        if peer == nil && connectTask == nil {
            phase = reconnectAttempt == 0 ? .connecting : .reconnecting
            await publish()
        }
        startReconnectLoop()
    }

    func call<Input: Encodable & Sendable, Output: Decodable & Sendable>(
        path: String,
        input: Input,
        output: Output.Type
    ) async throws -> Output {
        let activePeer = try await connectIfNeeded()
        let generation = connectionGeneration
        do {
            return try await activePeer.call(path: path, input: input, output: output)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            await invalidate(generation: generation)
            throw error
        }
    }

    func revive() async {
        guard !isStopped, phase != .authenticationFailed else { return }
        if let peer {
            do {
                try await pingWithTimeout(peer)
                return
            } catch {
                await invalidate(generation: connectionGeneration)
            }
        }
        reconnectAttempt = 0
        restartReconnectLoop()
        await start()
    }

    func forceReconnect() async {
        guard !isStopped else { return }
        authenticationRejections = 0
        reconnectAttempt = 0
        restartReconnectLoop()
        connectionAttemptGeneration += 1
        connectTask?.cancel()
        connectTask = nil
        heartbeatTask?.cancel()
        heartbeatTask = nil
        if let peer {
            await peer.close()
            self.peer = nil
        }
        phase = .connecting
        await publish()
        startReconnectLoop()
    }

    func shutdown() async {
        guard !isStopped else { return }
        isStopped = true
        reconnectGeneration += 1
        connectionAttemptGeneration += 1
        reconnectTask?.cancel()
        reconnectTask = nil
        connectTask?.cancel()
        connectTask = nil
        heartbeatTask?.cancel()
        heartbeatTask = nil
        if let peer {
            await peer.close()
            self.peer = nil
        }
        phase = .idle
    }

    private func connectIfNeeded() async throws -> RuntimeOrpcPeer {
        guard !isStopped else { throw RuntimeSessionError.closed }
        if let peer { return peer }
        if let connectTask {
            let attemptGeneration = connectionAttemptGeneration
            do {
                let connectedPeer = try await connectTask.value
                return try await adopt(connectedPeer, attemptGeneration: attemptGeneration)
            } catch {
                try await recordConnectionFailure(error, attemptGeneration: attemptGeneration)
                throw error
            }
        }
        guard phase != .authenticationFailed else {
            throw RuntimeSessionError.authenticationFailed
        }

        phase = reconnectAttempt == 0 ? .connecting : .reconnecting
        await publish()
        let credential = credential
        connectionAttemptGeneration += 1
        let attemptGeneration = connectionAttemptGeneration
        let task = Task {
            let connection = try await AuthenticatedRuntimeConnection.connect(
                endpoint: credential.profile.endpoint,
                desktopPublicKeyBase64: credential.profile.publicKeyBase64,
                deviceToken: credential.deviceToken
            )
            return RuntimeOrpcPeer(connection: connection)
        }
        connectTask = task

        do {
            let connectedPeer = try await task.value
            return try await adopt(connectedPeer, attemptGeneration: attemptGeneration)
        } catch {
            try await recordConnectionFailure(error, attemptGeneration: attemptGeneration)
            throw error
        }
    }

    private func adopt(_ connectedPeer: RuntimeOrpcPeer, attemptGeneration: Int) async throws
        -> RuntimeOrpcPeer
    {
        guard !isStopped, attemptGeneration == connectionAttemptGeneration else {
            await connectedPeer.close()
            throw CancellationError()
        }
        if let peer { return peer }
        connectTask = nil
        peer = connectedPeer
        reconnectAttempt = 0
        authenticationRejections = 0
        lastConnectedAt = Date()
        connectionGeneration += 1
        phase = .connected
        await publish()
        startHeartbeat(peer: connectedPeer, generation: connectionGeneration)
        return connectedPeer
    }

    private func recordConnectionFailure(_ error: Error, attemptGeneration: Int) async throws {
        guard attemptGeneration == connectionAttemptGeneration, connectTask != nil else { return }
        connectTask = nil
        if error is CancellationError { return }
        reconnectAttempt = min(reconnectAttempt + 1, policy.fastAttemptLimit)
        if let runtimeError = error as? AuthenticatedRuntimeError,
            case .authenticationFailed = runtimeError
        {
            authenticationRejections += 1
            if authenticationRejections >= policy.authenticationRetryLimit {
                phase = .authenticationFailed
                await publish()
                throw RuntimeSessionError.authenticationFailed
            }
        }
        phase = reconnectAttempt >= policy.fastAttemptLimit ? .unreachable : .reconnecting
        await publish()
    }

    private func startReconnectLoop() {
        guard !isStopped, reconnectTask == nil, peer == nil,
            phase != .authenticationFailed
        else { return }
        reconnectGeneration += 1
        let generation = reconnectGeneration
        reconnectTask = Task { [weak self] in
            await self?.runReconnectLoop(generation: generation)
        }
    }

    private func restartReconnectLoop() {
        reconnectGeneration += 1
        reconnectTask?.cancel()
        reconnectTask = nil
    }

    private func runReconnectLoop(generation: Int) async {
        defer {
            if reconnectGeneration == generation {
                reconnectTask = nil
            }
        }
        while !Task.isCancelled && reconnectGeneration == generation {
            do {
                _ = try await connectIfNeeded()
                return
            } catch is CancellationError {
                return
            } catch RuntimeSessionError.authenticationFailed {
                return
            } catch {
                let delay = policy.delay(after: reconnectAttempt)
                do {
                    try await Task.sleep(for: delay)
                } catch {
                    return
                }
            }
        }
    }

    private func startHeartbeat(peer: RuntimeOrpcPeer, generation: Int) {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    try await Task.sleep(for: .seconds(20))
                    try await self?.pingWithTimeout(peer)
                } catch is CancellationError {
                    return
                } catch {
                    await self?.invalidate(generation: generation)
                    return
                }
            }
        }
    }

    private func pingWithTimeout(_ peer: RuntimeOrpcPeer) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask { try await peer.ping() }
            group.addTask {
                try await Task.sleep(for: .seconds(8))
                await peer.close()
                throw RuntimeSessionError.timeout
            }
            _ = try await group.next()
            group.cancelAll()
        }
    }

    private func invalidate(generation: Int) async {
        guard generation == connectionGeneration else { return }
        heartbeatTask?.cancel()
        heartbeatTask = nil
        if let peer {
            await peer.close()
            self.peer = nil
        }
        phase = .reconnecting
        await publish()
        startReconnectLoop()
    }

    private func publish() async {
        await publishSnapshot(snapshot())
    }
}

nonisolated enum RuntimeSessionError: Error {
    case authenticationFailed
    case timeout
    case closed
}
