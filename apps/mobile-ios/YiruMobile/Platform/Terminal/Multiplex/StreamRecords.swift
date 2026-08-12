import Foundation

nonisolated struct TerminalMultiplexViewportRecord: Codable, Equatable, Sendable {
    let cols: Int
    let rows: Int
}

nonisolated struct TerminalMultiplexSubscribeRecord: Encodable, Sendable {
    let terminal: String
    let transportGeneration: String
    let client: TerminalMultiplexClientRecord
    let viewport: TerminalMultiplexViewportRecord?
    let lastParsedSeq: String
    let delivery: TerminalMultiplexDeliveryRecord
    let snapshotMaxBytes: Int
    let capabilities: TerminalMultiplexCapabilitiesRecord
}

nonisolated struct TerminalMultiplexClientRecord: Encodable, Sendable {
    let id: String
    let type: String
}

nonisolated struct TerminalMultiplexDeliveryRecord: Encodable, Sendable {
    let visible: Bool
    let interested: Bool
    let priority: String
}

nonisolated struct TerminalMultiplexCapabilitiesRecord: Encodable, Sendable {
    let dualScreenSnapshot = 1
    let parseAck = 1
    let explicitWriteAck = 1
}

nonisolated struct TerminalMultiplexSubscribedRecord: Decodable, Sendable {
    let terminal: String
    let transportGeneration: String
    let initialState: String
    let snapshotId: UInt32
}

nonisolated struct TerminalMultiplexResizeRecord: Encodable, Sendable {
    let cols: Int
    let rows: Int
    let reason: String
}

nonisolated struct TerminalMultiplexErrorRecord: Decodable, Sendable {
    let message: String?
}
