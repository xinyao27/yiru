import Foundation

actor RuntimeTerminalMultiplexer {
    private let credential: HostCredential
    private let controlSession: RuntimeHostSession
    private let clientInstanceID: String
    private var bulk: TerminalBulkConnection?
    private var connectionTask: Task<TerminalBulkConnection, Error>?
    private var connectionAttempt: UUID?
    private var bulkControlGeneration: Int?
    private var isShutdown = false

    init(
        credential: HostCredential,
        controlSession: RuntimeHostSession,
        clientInstanceID: String
    ) {
        self.credential = credential
        self.controlSession = controlSession
        self.clientInstanceID = clientInstanceID
    }

    func openSession(terminalID: String) async throws -> any TerminalSession {
        guard !isShutdown else { throw RuntimeTerminalMultiplexerError.closed }
        async let shownTerminal: MobileTerminalShowWire = controlSession.call(
            path: MobileTerminalWireContract.showPath,
            input: MobileTerminalHandleRequestWire(terminal: terminalID),
            output: MobileTerminalShowWire.self
        )
        let shown = try await shownTerminal
        guard !isShutdown else { throw RuntimeTerminalMultiplexerError.closed }
        var activeBulk = try await activeBulk()
        let route: TerminalBulkRoute
        do {
            route = try await activeBulk.openRoute()
        } catch TerminalBulkConnectionError.routeIDsExhausted {
            await activeBulk.close()
            bulk = nil
            bulkControlGeneration = nil
            activeBulk = try await self.activeBulk()
            route = try await activeBulk.openRoute()
        }
        let session = TerminalMultiplexSession(
            route: route,
            terminalID: terminalID,
            transportGeneration: shown.transportGeneration,
            clientID: clientInstanceID
        )
        await session.start()
        return session
    }

    func shutdown() async {
        guard !isShutdown else { return }
        isShutdown = true
        connectionAttempt = nil
        connectionTask?.cancel()
        connectionTask = nil
        let closingBulk = bulk
        bulk = nil
        bulkControlGeneration = nil
        await closingBulk?.close()
    }

    private func activeBulk() async throws -> TerminalBulkConnection {
        let currentGeneration = await controlSession.generation()
        if let bulk, await bulk.isOpen(), bulkControlGeneration == currentGeneration {
            return bulk
        }
        await bulk?.close()
        bulk = nil
        bulkControlGeneration = nil
        if let connectionTask {
            let connected = try await connectionTask.value
            guard !isShutdown, connectionAttempt != nil else {
                await connected.close()
                throw CancellationError()
            }
            return connected
        }
        let attempt = UUID()
        connectionAttempt = attempt
        let task = makeConnectionTask()
        connectionTask = task
        do {
            let connected = try await task.value
            guard connectionAttempt == attempt, !isShutdown else {
                await connected.close()
                throw CancellationError()
            }
            bulk = connected
            bulkControlGeneration = await controlSession.generation()
            connectionTask = nil
            return connected
        } catch {
            if connectionAttempt == attempt {
                connectionTask = nil
            }
            throw error
        }
    }

    private func makeConnectionTask() -> Task<TerminalBulkConnection, Error> {
        let credential = credential
        let controlSession = controlSession
        let clientInstanceID = clientInstanceID
        return Task {
            let status: MobileRuntimeStatusWire = try await controlSession.call(
                path: MobileTerminalWireContract.statusPath,
                input: RuntimeNullWire(),
                output: MobileRuntimeStatusWire.self
            )
            guard
                status.capabilities?.contains(MobileTerminalWireContract.multiplexCapability)
                    == true
            else {
                throw RuntimeTerminalMultiplexerError.capabilityUnavailable
            }
            let controlGeneration = await controlSession.generation()
            let ticket: MobileTerminalOpenMultiplexWire = try await controlSession.call(
                path: MobileTerminalWireContract.openMultiplexPath,
                input: MobileTerminalOpenMultiplexRequestWire(
                    environmentId: status.runtimeId,
                    clientInstanceId: clientInstanceID
                ),
                output: MobileTerminalOpenMultiplexWire.self
            )
            guard await controlSession.generation() == controlGeneration else {
                throw RuntimeTerminalMultiplexerError.controlGenerationChanged
            }
            return try await TerminalBulkConnection.connect(
                ticket: ticket,
                credential: credential,
                isControlGenerationCurrent: {
                    await controlSession.generation() == controlGeneration
                }
            )
        }
    }
}

nonisolated enum RuntimeTerminalMultiplexerError: Error, Sendable {
    case capabilityUnavailable
    case closed
    case controlGenerationChanged
}
