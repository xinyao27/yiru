import Foundation

nonisolated enum TerminalMultiplexSessionError: Error, Sendable {
    case closed
    case invalidFrame
    case invalidSubscription
    case invalidCredit
    case invalidAcknowledgement
    case inputBackpressured
    case invalidInput
    case server(message: String?)
}

actor TerminalMultiplexSession: TerminalSession {
    nonisolated private static let routeID: UInt32 = 1

    private let bulk: TerminalBulkConnection
    private let terminalID: String
    private let transportGeneration: String
    private let clientID: String
    private let stream: AsyncThrowingStream<TerminalSessionEvent, Error>
    private let continuation: AsyncThrowingStream<TerminalSessionEvent, Error>.Continuation
    private let delivery: TerminalMultiplexDelivery
    private let input: TerminalMultiplexInputFlow
    private var receiveTask: Task<Void, Never>?
    private var viewport: TerminalGridSize?
    private var sentViewport: TerminalGridSize?
    private var isSubscribed = false
    private var isClosed = false

    init(
        bulk: TerminalBulkConnection,
        terminalID: String,
        transportGeneration: String,
        clientID: String
    ) {
        let pair = AsyncThrowingStream.makeStream(of: TerminalSessionEvent.self)
        stream = pair.stream
        continuation = pair.continuation
        self.bulk = bulk
        self.terminalID = terminalID
        self.transportGeneration = transportGeneration
        self.clientID = clientID
        input = TerminalMultiplexInputFlow(routeID: Self.routeID, bulk: bulk)
        delivery = TerminalMultiplexDelivery(
            routeID: Self.routeID,
            bulk: bulk,
            publishEvent: { event in pair.continuation.yield(event) }
        )
    }

    func start() {
        guard receiveTask == nil, !isClosed else { return }
        receiveTask = Task { [weak self] in
            await self?.receiveLoop()
        }
    }

    func events() -> AsyncThrowingStream<TerminalSessionEvent, Error> {
        stream
    }

    func sendInput(_ data: Data) async throws {
        try await input.enqueue(data, kind: 0)
    }

    func sendQueryReply(_ data: Data) async throws {
        try await input.enqueue(data, kind: 1)
    }

    func resize(_ size: TerminalGridSize) async throws {
        guard (1...1_000).contains(size.columns), (1...500).contains(size.rows) else {
            throw TerminalMultiplexSessionError.invalidFrame
        }
        viewport = size
        guard isSubscribed else { return }
        try await sendResize(size)
    }

    private func sendResize(_ size: TerminalGridSize) async throws {
        let payload = try JSONEncoder().encode(
            TerminalMultiplexResizeRecord(
                cols: size.columns,
                rows: size.rows,
                reason: "fit"
            )
        )
        try await send(
            opcode: .resize,
            sequence: await delivery.currentParsedSequence(),
            correlationID: try await bulk.allocateCorrelationID(),
            payload: payload
        )
    }

    func acknowledgeOutput(endSequence: UInt64, receiverQueueBytes: UInt32) async throws {
        try await delivery.acknowledgeOutput(
            endSequence: endSequence,
            receiverQueueBytes: receiverQueueBytes
        )
    }

    func acknowledgeSnapshot(id: UInt32) async throws {
        try await delivery.acknowledgeSnapshot(id: id)
    }

    func setAppState(_ state: TerminalSessionAppState) async {
        switch state {
        case .foreground:
            await bulk.setAppState(.foreground)
        case .background:
            await bulk.setAppState(.background)
        }
    }

    func close() async {
        guard !isClosed else { return }
        let sequence = await delivery.currentParsedSequence()
        if let correlationID = try? await bulk.allocateCorrelationID() {
            try? await send(
                opcode: .unsubscribe,
                sequence: sequence,
                correlationID: correlationID
            )
        }
        await finish()
    }

    private func receiveLoop() async {
        do {
            let events = await bulk.events()
            for try await event in events {
                switch event {
                case .accepted:
                    try await subscribe()
                case .frame(let frame):
                    try await handle(frame)
                }
            }
            if !isClosed {
                throw TerminalMultiplexSessionError.closed
            }
        } catch is CancellationError {
            return
        } catch {
            await fail(error)
        }
    }

    private func subscribe() async throws {
        let size = viewport.map {
            TerminalMultiplexViewportRecord(cols: $0.columns, rows: $0.rows)
        }
        let payload = try JSONEncoder().encode(
            TerminalMultiplexSubscribeRecord(
                terminal: terminalID,
                transportGeneration: transportGeneration,
                client: TerminalMultiplexClientRecord(id: clientID, type: "mobile"),
                viewport: size,
                lastParsedSeq: String(await delivery.currentParsedSequence()),
                delivery: TerminalMultiplexDeliveryRecord(
                    visible: true,
                    interested: true,
                    priority: "active"
                ),
                snapshotMaxBytes: TerminalSnapshotAssembler.maxBytes,
                capabilities: TerminalMultiplexCapabilitiesRecord()
            )
        )
        try await send(
            opcode: .subscribe,
            sequence: await delivery.currentParsedSequence(),
            correlationID: try await bulk.allocateCorrelationID(),
            payload: payload
        )
        sentViewport = viewport
    }

    private func handle(_ frame: TerminalMultiplexFrame) async throws {
        guard frame.routeID == Self.routeID, frame.unsupportedOpcode == nil else {
            throw TerminalMultiplexSessionError.invalidFrame
        }
        if try await delivery.handle(frame) { return }
        switch frame.opcode {
        case .subscribed:
            try await handleSubscribed(frame)
        case .credit:
            try await handleCredit(frame)
        case .ack:
            try await handleAcknowledgement(frame)
        case .error:
            let record = try? JSONDecoder().decode(
                TerminalMultiplexErrorRecord.self,
                from: frame.payload
            )
            throw TerminalMultiplexSessionError.server(message: record?.message)
        case .clearBuffer:
            continuation.yield(.clearBuffer)
        case .resized, .metadata, .fitOverride, .driver, .sideEffectBatch:
            break
        case .epoch, .heartbeat, .subscribe, .unsubscribe, .end, .output, .input,
            .resize, .claimViewport, .snapshotRequest, .snapshotStart, .snapshotChunk,
            .snapshotEnd, .visibilityGate, .revealSnapshot, .modelRestore, .signal, .kill:
            throw TerminalMultiplexSessionError.invalidFrame
        }
    }

    private func handleSubscribed(_ frame: TerminalMultiplexFrame) async throws {
        let record = try JSONDecoder().decode(
            TerminalMultiplexSubscribedRecord.self,
            from: frame.payload
        )
        guard record.terminal == terminalID,
            record.transportGeneration == transportGeneration,
            record.initialState == "snapshot",
            record.snapshotId != 0
        else {
            throw TerminalMultiplexSessionError.invalidSubscription
        }
        isSubscribed = true
        if let viewport, viewport != sentViewport {
            try await sendResize(viewport)
        }
        try await delivery.beginInitialSnapshot(id: record.snapshotId)
    }

    private func handleCredit(_ frame: TerminalMultiplexFrame) async throws {
        guard frame.sequence == 0, frame.correlationID == 0,
            let credit = TerminalMultiplexFlowRecordCodec.decodeCredit(frame.payload),
            credit.maxFrameBytes > 0,
            credit.maxFrameBytes <= UInt32(MobileTerminalMultiplexWireContract.hardMaxFrameBytes)
        else {
            throw TerminalMultiplexSessionError.invalidCredit
        }
        if credit.direction == 0 {
            try await delivery.applyOutputCredit(
                credit.maxInFlightBytes,
                reason: credit.reason
            )
            return
        }
        try await input.applyCredit(credit)
    }

    private func handleAcknowledgement(_ frame: TerminalMultiplexFrame) async throws {
        try await input.acknowledge(frame)
    }

    private func send(
        opcode: TerminalMultiplexOpcodeWire,
        sequence: UInt64 = 0,
        correlationID: UInt32 = 0,
        payload: Data = Data()
    ) async throws {
        guard !isClosed else { throw TerminalMultiplexSessionError.closed }
        try await bulk.send(
            TerminalMultiplexFrame(
                opcode: opcode,
                routeID: Self.routeID,
                epoch: 0,
                sequence: sequence,
                correlationID: correlationID,
                payload: payload
            )
        )
    }

    private func fail(_ error: Error) async {
        guard !isClosed else { return }
        isClosed = true
        receiveTask = nil
        await bulk.close()
        continuation.finish(throwing: error)
    }

    private func finish() async {
        guard !isClosed else { return }
        isClosed = true
        receiveTask?.cancel()
        receiveTask = nil
        await bulk.close()
        continuation.finish()
    }
}
