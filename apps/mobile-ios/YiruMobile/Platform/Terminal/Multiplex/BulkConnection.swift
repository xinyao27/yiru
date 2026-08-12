import Foundation

nonisolated enum TerminalBulkConnectionEvent: Sendable {
    case accepted
    case frame(TerminalMultiplexFrame)
}

nonisolated enum TerminalBulkConnectionError: Error, Sendable {
    case expiredTicket
    case invalidPeerMessage
    case iteratorEnded
    case server(status: Int)
    case staleAfterBackground
}

actor TerminalBulkConnection {
    typealias IsControlGenerationCurrent = @Sendable () async -> Bool

    private let connection: AuthenticatedRuntimeConnection
    private let isControlGenerationCurrent: IsControlGenerationCurrent
    private let requestID = UUID().uuidString.lowercased()
    private let stream: AsyncThrowingStream<TerminalBulkConnectionEvent, Error>
    private let continuation: AsyncThrowingStream<TerminalBulkConnectionEvent, Error>.Continuation
    private var wire: TerminalMultiplexWire?
    private var receiveTask: Task<Void, Never>?
    private var hasAcceptedEpoch = false
    private var hasIteratorReady = false
    private var hasPublishedReady = false
    private var backgroundedAt: Date?
    private var isClosed = false

    private init(
        connection: AuthenticatedRuntimeConnection,
        isControlGenerationCurrent: @escaping IsControlGenerationCurrent
    ) {
        let pair = AsyncThrowingStream.makeStream(of: TerminalBulkConnectionEvent.self)
        stream = pair.stream
        continuation = pair.continuation
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
        return bulk
    }

    func events() -> AsyncThrowingStream<TerminalBulkConnectionEvent, Error> {
        stream
    }

    func send(_ frame: TerminalMultiplexFrame) async throws {
        guard hasPublishedReady, let wire else {
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
        return try await wire.allocateCorrelationID()
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
        continuation.finish()
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

    private func sendInvocation(bulkTicket: String) async throws {
        let input = TerminalMultiplexInvocationInput(bulkTicket: bulkTicket)
        let request = TerminalMultiplexInvocation(
            i: requestID,
            p: TerminalMultiplexInvocationPayload(
                u: MobileTerminalWireContract.multiplexPath,
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
            if message.p.e == "error" || message.p.e == "done" {
                throw TerminalBulkConnectionError.iteratorEnded
            }
            guard message.p.e == "message" else {
                throw TerminalBulkConnectionError.invalidPeerMessage
            }
            guard message.p.d?.json.type == "ready" else {
                throw TerminalBulkConnectionError.invalidPeerMessage
            }
            hasIteratorReady = true
            publishReadyIfNeeded()
        default:
            throw TerminalBulkConnectionError.invalidPeerMessage
        }
    }

    private func receiveBinary(_ data: Data) async throws {
        let sideChannel = try RuntimeOrpcSideChannelCodec.decode(data)
        guard sideChannel.requestID == requestID, let wire else {
            throw TerminalBulkConnectionError.invalidPeerMessage
        }
        try await wire.handle(sideChannel.payload)
    }

    private func sendInner(_ bytes: Data) async throws {
        let sideChannel = try RuntimeOrpcSideChannelCodec.encode(
            requestID: requestID,
            payload: bytes
        )
        try await connection.sendBinary(sideChannel)
    }

    private func publish(_ event: TerminalMultiplexWireEvent) {
        switch event {
        case .accepted:
            hasAcceptedEpoch = true
            publishReadyIfNeeded()
        case .streamFrame(let frame):
            continuation.yield(.frame(frame))
        }
    }

    private func publishReadyIfNeeded() {
        guard hasAcceptedEpoch, hasIteratorReady, !hasPublishedReady else { return }
        hasPublishedReady = true
        continuation.yield(.accepted)
    }

    private func fail(_ error: Error) async {
        guard !isClosed else { return }
        isClosed = true
        receiveTask?.cancel()
        receiveTask = nil
        await wire?.close()
        let details = closeDetails(error)
        await connection.close(code: details.code, reason: details.reason)
        continuation.finish(throwing: error)
    }
}

nonisolated private struct TerminalMultiplexInvocation: Encodable {
    let i: String
    let p: TerminalMultiplexInvocationPayload
}

nonisolated private struct TerminalMultiplexInvocationPayload: Encodable {
    let u: String
    let b: TerminalMultiplexInvocationBody
    let h: [String: String]
}

nonisolated private struct TerminalMultiplexInvocationBody: Encodable {
    let json: TerminalMultiplexInvocationInput
}

nonisolated private struct TerminalMultiplexInvocationInput: Encodable {
    let bulkTicket: String
}

nonisolated private struct TerminalMultiplexPeerMessage: Decodable {
    let i: String
    let t: Int?
    let p: TerminalMultiplexPeerPayload
}

nonisolated private struct TerminalMultiplexPeerPayload: Decodable {
    let s: Int?
    let e: String?
    let d: TerminalMultiplexPeerEvent?
}

nonisolated private struct TerminalMultiplexPeerEvent: Decodable {
    let json: TerminalMultiplexReadyEvent
}

nonisolated private struct TerminalMultiplexReadyEvent: Decodable {
    let type: String
}

nonisolated private func closeDetails(_ error: Error) -> (code: Int, reason: String) {
    if let frameError = error as? TerminalMultiplexFrameError {
        switch frameError {
        case .invalidLength:
            return (1009, "invalid terminal frame length")
        case .invalidHeader, .invalidRoute, .unsupportedOpcode:
            return (1002, "invalid terminal frame")
        }
    }
    if let wireError = error as? TerminalMultiplexWireError {
        switch wireError {
        case .heartbeatTimedOut, .correlationIDsExhausted:
            return (1001, "terminal epoch expired")
        case .duplicateEpoch, .epochMismatch, .frameBeforeAcceptance, .invalidEpoch,
            .invalidHeartbeat:
            return (1002, "terminal protocol violation")
        }
    }
    if let bulkError = error as? TerminalBulkConnectionError {
        if case .staleAfterBackground = bulkError {
            return (1001, "terminal epoch stale after background")
        }
        return (1002, "invalid terminal peer message")
    }
    if error is RuntimeOrpcSideChannelError {
        return (1002, "invalid terminal side channel")
    }
    return (1001, "terminal connection closed")
}
