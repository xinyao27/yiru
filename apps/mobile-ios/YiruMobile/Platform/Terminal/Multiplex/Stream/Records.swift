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

nonisolated struct TerminalMultiplexRevealRecord: Encodable, Sendable {
    let stateVersion: UInt32
}

nonisolated struct TerminalMultiplexEndRecord: Decodable, Sendable {
    let exitCode: Int32?
    let reason: TerminalMultiplexEndReason
    let historyKept: Bool

    private enum CodingKeys: String, CodingKey {
        case exitCode
        case reason
        case historyKept
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard container.contains(.exitCode) else {
            throw DecodingError.keyNotFound(
                CodingKeys.exitCode,
                DecodingError.Context(
                    codingPath: container.codingPath,
                    debugDescription: "Missing terminal exit code"
                )
            )
        }
        exitCode = try container.decodeIfPresent(Int32.self, forKey: .exitCode)
        reason = try container.decode(TerminalMultiplexEndReason.self, forKey: .reason)
        historyKept = try container.decode(Bool.self, forKey: .historyKept)
    }
}

nonisolated enum TerminalMultiplexEndReason: String, Decodable, Sendable {
    case exit
}

nonisolated struct TerminalMultiplexModelRestoreRecord: Decodable, Sendable {
    let reason: TerminalMultiplexModelRestoreReason
    let markerSeq: String
    let snapshotFollows: Bool
}

nonisolated enum TerminalMultiplexModelRestoreReason: String, Decodable, Sendable {
    case hiddenDrop = "hidden-drop"
    case pendingCap = "pending-cap"
    case ackStall = "ack-stall"
    case sequenceGap = "sequence-gap"
    case providerGap = "provider-gap"
    case rendererReplaced = "renderer-replaced"
}
