import Foundation

actor TerminalMultiplexInputFlow {
    private struct PendingInput: Sendable {
        let kind: UInt8
        let bytes: Data
    }

    nonisolated private static let pendingBytesLimit = 256 * 1_024

    private let route: TerminalBulkRoute
    private var inputSequence: UInt64 = 0
    private var acknowledgedSequence: UInt64 = 0
    private var creditBytes: UInt32 = 0
    private var maxFrameBytes = 64 * 1_024
    private var pending: [PendingInput] = []
    private var pendingBytes = 0

    init(route: TerminalBulkRoute) {
        self.route = route
    }

    func enqueue(_ data: Data, kind: UInt8) async throws {
        guard let chunks = TerminalInputChunks.split(data, maxBytes: maxFrameBytes) else {
            throw TerminalMultiplexSessionError.invalidInput
        }
        let addedBytes = chunks.reduce(0) { $0 + $1.count }
        guard pendingBytes + addedBytes <= Self.pendingBytesLimit else {
            throw TerminalMultiplexSessionError.inputBackpressured
        }
        pending.append(contentsOf: chunks.map { PendingInput(kind: kind, bytes: $0) })
        pendingBytes += addedBytes
        try await flush()
    }

    func applyCredit(_ record: TerminalMultiplexCreditRecord) async throws {
        creditBytes = record.maxInFlightBytes
        maxFrameBytes = min(64 * 1_024, Int(record.maxFrameBytes))
        try await flush()
    }

    func acknowledge(_ frame: TerminalMultiplexFrame) async throws {
        guard let record = TerminalMultiplexFlowRecordCodec.decodeAck(frame.payload),
            record.cumulativeSequence == frame.sequence
        else {
            throw TerminalMultiplexSessionError.invalidAcknowledgement
        }
        guard record.kind == 1 else {
            if record.status != 0 {
                throw TerminalMultiplexSessionError.invalidAcknowledgement
            }
            return
        }
        guard record.status == 0,
            record.cumulativeSequence >= acknowledgedSequence,
            record.cumulativeSequence <= inputSequence
        else {
            inputSequence = record.cumulativeSequence
            acknowledgedSequence = record.cumulativeSequence
            throw TerminalMultiplexSessionError.invalidAcknowledgement
        }
        acknowledgedSequence = record.cumulativeSequence
        try await flush()
    }

    private func flush() async throws {
        while let next = pending.first {
            let inFlight = inputSequence - acknowledgedSequence
            guard inFlight + UInt64(next.bytes.count) <= UInt64(creditBytes) else { return }
            guard
                let payload = TerminalMultiplexFlowRecordCodec.encode(
                    TerminalMultiplexInputRecord(kind: next.kind, data: next.bytes)
                )
            else {
                throw TerminalMultiplexSessionError.invalidInput
            }
            pending.removeFirst()
            pendingBytes -= next.bytes.count
            inputSequence += UInt64(next.bytes.count)
            try await route.send(
                opcode: .input,
                sequence: inputSequence,
                correlationID: try await route.allocateCorrelationID(),
                payload: payload
            )
        }
    }
}
