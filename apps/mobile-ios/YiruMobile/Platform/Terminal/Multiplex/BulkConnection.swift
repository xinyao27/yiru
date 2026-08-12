import Foundation

actor TerminalBulkConnection {
    typealias IsControlGenerationCurrent = @Sendable () async -> Bool

    private let connection: AuthenticatedRuntimeConnection
    private let isControlGenerationCurrent: IsControlGenerationCurrent
    private let requestID = UUID().uuidString.lowercased()
    private var wire: TerminalMultiplexWire?
    private var receiveTask: Task<Void, Never>?
    private var routeContinuations:
        [UInt32: AsyncThrowingStream<TerminalBulkRouteEvent, Error>.Continuation] = [:]
    private var nextRouteID: UInt32 = 1
    private var maxStreams: UInt32?
    private var hasAcceptedEpoch = false
    private var hasIteratorReady = false
    private var hasPublishedReady = false
    private var readyWaiters: [CheckedContinuation<Void, Error>] = []
    private var backgroundedAt: Date?
    private var isClosed = false

    private init(
        connection: AuthenticatedRuntimeConnection,
        isControlGenerationCurrent: @escaping IsControlGenerationCurrent
    ) {
        self.connection = connection
        self.isControlGenerationCurrent = isControlGenerationCurrent
    }

    static func connect(
        ticket: MobileTerminalOpenMultiplexWire,
        credential: HostCredential,
        isControlGenerationCurrent: @escaping IsControlGenerationCurrent
    ) async throws -> TerminalBulkConnection {
        guard ticket.expiresAt > Int64(Date().timeIntervalSince1970 * 1_000) else {
            throw TerminalBulkConnectionError.expiredTicket
        }
        let connection = try await AuthenticatedRuntimeConnection.connect(
            endpoint: ticket.bulkEndpoint,
            desktopPublicKeyBase64: credential.profile.publicKeyBase64,
            deviceToken: credential.deviceToken
        )
        let bulk = TerminalBulkConnection(
            connection: connection,
            isControlGenerationCurrent: isControlGenerationCurrent
        )
        try await bulk.start(ticket: ticket)
        try await bulk.waitUntilReady()
        return bulk
    }

    func openRoute() throws -> TerminalBulkRoute {
        guard !isClosed else { throw TerminalBulkConnectionError.invalidPeerMessage }
        guard nextRouteID > 0, nextRouteID <= 0x7fff_ffff else {
            throw TerminalBulkConnectionError.routeIDsExhausted
        }
        if let maxStreams, routeContinuations.count >= Int(maxStreams) {
            throw TerminalBulkConnectionError.maxStreamsExceeded
        }
        let routeID = nextRouteID
        nextRouteID += 1
        let pair = AsyncThrowingStream.makeStream(of: TerminalBulkRouteEvent.self)
        routeContinuations[routeID] = pair.continuation
        if hasPublishedReady {
            pair.continuation.yield(.accepted)
        }
        return TerminalBulkRoute(id: routeID, bulk: self, stream: pair.stream)
    }

    func isOpen() -> Bool {
        !isClosed
    }

    func closeRoute(_ routeID: UInt32) async {
        routeContinuations.removeValue(forKey: routeID)?.finish()
        if routeContinuations.isEmpty {
            await close()
        }
    }

    func send(_ frame: TerminalMultiplexFrame) async throws {
        try await requireCurrentControlGeneration()
        guard hasPublishedReady, routeContinuations[frame.routeID] != nil, let wire else {
            throw TerminalBulkConnectionError.invalidPeerMessage
        }
        try await wire.send(
            opcode: frame.opcode,
            routeID: frame.routeID,
            sequence: frame.sequence,
            correlationID: frame.correlationID,
            payload: frame.payload
        )
    }

    func allocateCorrelationID() async throws -> UInt32 {
        guard let wire else { throw TerminalBulkConnectionError.invalidPeerMessage }
        do {
            return try await wire.allocateCorrelationID()
        } catch TerminalMultiplexWireError.correlationIDsExhausted {
            await fail(TerminalMultiplexWireError.correlationIDsExhausted)
            throw TerminalMultiplexWireError.correlationIDsExhausted
        }
    }

    func setAppState(_ state: TerminalMultiplexAppState) async {
        guard let wire, !isClosed else { return }
        if state == .background {
            backgroundedAt = Date()
            await wire.setAppState(state)
            return
        }
        let backgroundSeconds = backgroundedAt.map { Date().timeIntervalSince($0) } ?? 0
        backgroundedAt = nil
        guard backgroundSeconds <= 5, await wire.isFresh(), await connection.isOpen(),
            await isControlGenerationCurrent()
        else {
            await fail(TerminalBulkConnectionError.staleAfterBackground)
            return
        }
        await wire.setAppState(state)
    }

    func close() async {
        guard !isClosed else { return }
        isClosed = true
        receiveTask?.cancel()
        receiveTask = nil
        await wire?.close()
        await connection.close()
        finishRoutes()
    }

    private func start(ticket: MobileTerminalOpenMultiplexWire) async throws {
        wire = TerminalMultiplexWire(
            maxFrameBytes: ticket.maxFrameBytes,
            sendBytes: { [weak self] bytes in
                guard let self else { throw CancellationError() }
                try await self.sendInner(bytes)
            },
            publishEvent: { [weak self] event in
                await self?.publish(event)
            },
            publishFailure: { [weak self] error in
                await self?.fail(error)
            }
        )
        receiveTask = Task { [weak self] in
            await self?.receiveLoop()
        }
        do {
            try await sendInvocation(bulkTicket: ticket.bulkTicket)
        } catch {
            await fail(error)
            throw error
        }
    }

    private func waitUntilReady() async throws {
        if hasPublishedReady { return }
        guard !isClosed else { throw TerminalBulkConnectionError.invalidPeerMessage }
        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<Void, Error>) in
            readyWaiters.append(continuation)
        }
    }

    private func sendInvocation(bulkTicket: String) async throws {
        try await requireCurrentControlGeneration()
        let input = TerminalMultiplexInvocationInput(bulkTicket: bulkTicket)
        let request = TerminalMultiplexInvocation(
            i: requestID,
            p: TerminalMultiplexInvocationPayload(
                b: TerminalMultiplexInvocationBody(json: input),
                h: [
                    MobileRuntimeWireContract.requestIdHeader: requestID,
                    MobileRuntimeWireContract.binarySideChannelHeader: "1",
                ]
            )
        )
        let data = try JSONEncoder().encode(request)
        guard let text = String(data: data, encoding: .utf8) else {
            throw TerminalBulkConnectionError.invalidPeerMessage
        }
        try await connection.sendText(MobileRuntimeWireContract.textPrefix + text)
    }

    private func receiveLoop() async {
        do {
            while !Task.isCancelled && !isClosed {
                switch try await connection.receive() {
                case .text(let text):
                    try receiveText(text)
                case .binary(let data):
                    try await receiveBinary(data)
                }
            }
        } catch is CancellationError {
            return
        } catch {
            await fail(error)
        }
    }

    private func receiveText(_ text: String) throws {
        guard text.hasPrefix(MobileRuntimeWireContract.textPrefix) else {
            throw TerminalBulkConnectionError.invalidPeerMessage
        }
        let data = Data(text.dropFirst(MobileRuntimeWireContract.textPrefix.count).utf8)
        guard let message = try? JSONDecoder().decode(TerminalMultiplexPeerMessage.self, from: data)
        else {
            throw TerminalBulkConnectionError.invalidPeerMessage
        }
        guard message.i == requestID else {
            throw TerminalBulkConnectionError.invalidPeerMessage
        }
        switch message.t {
        case nil, 2:
            let status = message.p.s ?? 200
            guard status >= 200 && status < 400 else {
                throw TerminalBulkConnectionError.server(status: status)
            }
        case 3:
            if message.p.e == .error || message.p.e == .done {
                throw TerminalBulkConnectionError.iteratorEnded
            }
            guard message.p.e == .message else {
                throw TerminalBulkConnectionError.invalidPeerMessage
            }
            guard message.p.d?.json.type == .ready else {
                throw TerminalBulkConnectionError.invalidPeerMessage
            }
            hasIteratorReady = true
            publishReadyIfNeeded()
        default:
            throw TerminalBulkConnectionError.invalidPeerMessage
        }
    }

    private func receiveBinary(_ data: Data) async throws {
        guard await isControlGenerationCurrent() else {
            throw TerminalBulkConnectionError.staleControlGeneration
        }
        let sideChannel = try RuntimeOrpcSideChannelCodec.decode(data)
        guard sideChannel.requestID == requestID, let wire else {
            throw TerminalBulkConnectionError.invalidPeerMessage
        }
        try await wire.handle(sideChannel.payload)
    }

    private func sendInner(_ bytes: Data) async throws {
        try await requireCurrentControlGeneration()
        let sideChannel = try RuntimeOrpcSideChannelCodec.encode(
            requestID: requestID,
            payload: bytes
        )
        try await connection.sendBinary(sideChannel)
    }

    private func requireCurrentControlGeneration() async throws {
        guard await isControlGenerationCurrent() else {
            let error = TerminalBulkConnectionError.staleControlGeneration
            await fail(error)
            throw error
        }
    }

    private func publish(_ event: TerminalMultiplexWireEvent) async {
        switch event {
        case .accepted(let maxStreams):
            guard routeContinuations.count <= Int(maxStreams) else {
                await fail(TerminalBulkConnectionError.maxStreamsExceeded)
                return
            }
            self.maxStreams = maxStreams
            hasAcceptedEpoch = true
            publishReadyIfNeeded()
        case .streamFrame(let frame):
            routeContinuations[frame.routeID]?.yield(.frame(frame))
        }
    }

    private func publishReadyIfNeeded() {
        guard hasAcceptedEpoch, hasIteratorReady, !hasPublishedReady else { return }
        hasPublishedReady = true
        routeContinuations.values.forEach { $0.yield(.accepted) }
        let waiters = readyWaiters
        readyWaiters.removeAll()
        waiters.forEach { $0.resume() }
    }

    private func fail(_ error: Error) async {
        guard !isClosed else { return }
        isClosed = true
        receiveTask?.cancel()
        receiveTask = nil
        await wire?.close()
        let details = terminalBulkCloseDetails(error)
        await connection.close(code: details.code, reason: details.reason)
        let waiters = readyWaiters
        readyWaiters.removeAll()
        waiters.forEach { $0.resume(throwing: error) }
        finishRoutes(throwing: error)
    }

    private func finishRoutes(throwing error: Error? = nil) {
        let continuations = routeContinuations.values
        routeContinuations.removeAll()
        for continuation in continuations {
            if let error {
                continuation.finish(throwing: error)
            } else {
                continuation.finish()
            }
        }
    }
}
