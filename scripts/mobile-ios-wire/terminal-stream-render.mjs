export function renderTerminalStreamRecords(contract) {
  const cases = (values) =>
    values.map((value) => `    case ${swiftCase(value)} = ${JSON.stringify(value)}`).join('\n')
  return `enum TerminalMultiplexStreamRecordWire {
    static let columnsMin = ${contract.wire.viewport.columnsMin}
    static let columnsMax = ${contract.wire.viewport.columnsMax}
    static let rowsMin = ${contract.wire.viewport.rowsMin}
    static let rowsMax = ${contract.wire.viewport.rowsMax}
    static let snapshotMaxBytes = ${contract.wire.snapshotMaxBytes}
}

enum TerminalMultiplexClientType: String, Codable, Sendable {
${cases(contract.clientTypes)}
}

enum TerminalMultiplexDeliveryPriority: String, Codable, Sendable {
${cases(contract.deliveryPriorities)}
}

enum TerminalMultiplexInitialState: String, Codable, Sendable {
${cases(contract.initialStates)}
}

enum TerminalMultiplexPtyState: String, Codable, Sendable {
${cases(contract.ptyStates)}
}

enum TerminalMultiplexDisplayMode: String, Codable, Sendable {
${cases(contract.displayModes)}
}

enum TerminalMultiplexDriverKind: String, Codable, Sendable {
${cases(contract.drivers.map(({ kind }) => kind))}
}

enum TerminalMultiplexResizeReason: String, Codable, Sendable {
${cases(contract.resizeReasons)}
}

enum TerminalMultiplexEndReason: String, Codable, Sendable {
${cases(contract.endReasons)}
}

enum TerminalMultiplexModelRestoreReason: String, Codable, Sendable {
${cases(contract.restoreReasons)}
}

struct TerminalMultiplexViewportRecord: Codable, Equatable, Sendable {
    let cols: Int
    let rows: Int
}

struct TerminalMultiplexClientRecord: Encodable, Sendable {
    let id: String
    let type: TerminalMultiplexClientType
}

struct TerminalMultiplexDeliveryRecord: Encodable, Sendable {
    let visible: Bool
    let interested: Bool
    let priority: TerminalMultiplexDeliveryPriority
}

struct TerminalMultiplexCapabilitiesRecord: Encodable, Sendable {
    let dualScreenSnapshot = ${contract.capabilityValues.dualScreenSnapshot}
    let parseAck = ${contract.capabilityValues.parseAck}
    let explicitWriteAck = ${contract.capabilityValues.explicitWriteAck}
}

struct TerminalMultiplexSubscribeRecord: Encodable, Sendable {
    let terminal: String
    let transportGeneration: String
    let client: TerminalMultiplexClientRecord
    let viewport: TerminalMultiplexViewportRecord?
    let lastParsedSeq: String
    let delivery: TerminalMultiplexDeliveryRecord
    let snapshotMaxBytes: Int
    let capabilities: TerminalMultiplexCapabilitiesRecord
}

struct TerminalMultiplexSubscribedRecord: Decodable, Sendable {
    let terminal: String
    let transportGeneration: String
    let ptyState: TerminalMultiplexPtyState
    let cols: Int
    let rows: Int
    let displayMode: TerminalMultiplexDisplayMode
    let driver: TerminalMultiplexDriverRecord
    let initialState: TerminalMultiplexInitialState
    let snapshotId: UInt32?
    let truncated: Bool
}

struct TerminalMultiplexDriverRecord: Decodable, Sendable {
    let kind: TerminalMultiplexDriverKind
    let clientId: String?

    private enum CodingKeys: String, CodingKey {
        case kind
        case clientId
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(TerminalMultiplexDriverKind.self, forKey: .kind)
        switch kind {
${renderDriverDecodeCases(contract.drivers)}
        }
    }
}

struct TerminalMultiplexResizeRecord: Encodable, Sendable {
    let cols: Int
    let rows: Int
    let reason: TerminalMultiplexResizeReason
}

struct TerminalMultiplexErrorRecord: Decodable, Sendable {
    let message: String?
}

struct TerminalMultiplexRevealRecord: Encodable, Sendable {
    let stateVersion: UInt32
}

struct TerminalMultiplexSnapshotRequestRecord: Encodable, Sendable {
    let requestedScrollbackRows: UInt32
    let snapshotMaxBytes: UInt32?
}

struct TerminalMultiplexEndRecord: Decodable, Sendable {
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

struct TerminalMultiplexModelRestoreRecord: Decodable, Sendable {
    let reason: TerminalMultiplexModelRestoreReason
    let markerSeq: String
    let snapshotFollows: Bool
}`
}

function swiftCase(value) {
  const words = value.split('-')
  return `${words[0]}${words
    .slice(1)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join('')}`
}

function renderDriverDecodeCases(drivers) {
  return drivers
    .map(({ kind, hasClientID }) => {
      const label = `        case .${swiftCase(kind)}:`
      if (hasClientID) {
        return `${label}
            let value = try container.decode(String.self, forKey: .clientId)
            guard !value.isEmpty else {
                throw DecodingError.dataCorruptedError(
                    forKey: .clientId,
                    in: container,
                    debugDescription: "Terminal driver client ID must not be empty"
                )
            }
            clientId = value`
      }
      return `${label}
            guard !container.contains(.clientId) else {
                throw DecodingError.dataCorruptedError(
                    forKey: .clientId,
                    in: container,
                    debugDescription: "Terminal driver client ID is not allowed"
                )
            }
            clientId = nil`
    })
    .join('\n')
}
