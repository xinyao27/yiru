import Foundation

nonisolated enum TerminalMultiplexHandshakePhase: UInt8, Sendable {
    case offer = 0
    case accept = 1
}

nonisolated enum TerminalMultiplexAppState: UInt8, Sendable {
    case foreground = 0
    case background = 1
    case unknown = 2
}

nonisolated struct TerminalMultiplexEpochRecord: Equatable, Sendable {
    let phase: TerminalMultiplexHandshakePhase
    let protocolMinor: UInt8
    let maxFrameBytes: UInt32
    let maxStreams: UInt32
    let heartbeatMilliseconds: UInt32
    let connectionGeneration: UInt32
}

nonisolated struct TerminalMultiplexHeartbeatRecord: Equatable, Sendable {
    let phase: TerminalMultiplexHandshakePhase
    let appState: TerminalMultiplexAppState
    let senderQueueBytes: UInt32
    let monotonicMicroseconds: UInt64
}

nonisolated enum TerminalMultiplexConnectionRecordCodec {
    private static let epochBytes = 24
    private static let heartbeatBytes = 16

    static func encode(_ record: TerminalMultiplexEpochRecord) -> Data {
        var data = Data(repeating: 0, count: epochBytes)
        data[0] = record.phase.rawValue
        data[1] = record.protocolMinor
        TerminalWireBytes.write(record.maxFrameBytes, to: &data, at: 4)
        TerminalWireBytes.write(record.maxStreams, to: &data, at: 8)
        TerminalWireBytes.write(record.heartbeatMilliseconds, to: &data, at: 12)
        TerminalWireBytes.write(record.connectionGeneration, to: &data, at: 16)
        return data
    }

    static func decodeEpoch(_ data: Data) -> TerminalMultiplexEpochRecord? {
        guard data.count == epochBytes,
            let phase = TerminalMultiplexHandshakePhase(
                rawValue: TerminalWireBytes.byte(in: data, at: 0)
            ),
            TerminalWireBytes.uint16(in: data, at: 2) == 0,
            TerminalWireBytes.uint32(in: data, at: 20) == 0
        else {
            return nil
        }
        return TerminalMultiplexEpochRecord(
            phase: phase,
            protocolMinor: TerminalWireBytes.byte(in: data, at: 1),
            maxFrameBytes: TerminalWireBytes.uint32(in: data, at: 4),
            maxStreams: TerminalWireBytes.uint32(in: data, at: 8),
            heartbeatMilliseconds: TerminalWireBytes.uint32(in: data, at: 12),
            connectionGeneration: TerminalWireBytes.uint32(in: data, at: 16)
        )
    }

    static func encode(_ record: TerminalMultiplexHeartbeatRecord) -> Data {
        var data = Data(repeating: 0, count: heartbeatBytes)
        data[0] = record.phase.rawValue
        data[1] = record.appState.rawValue
        TerminalWireBytes.write(record.senderQueueBytes, to: &data, at: 4)
        TerminalWireBytes.write(record.monotonicMicroseconds, to: &data, at: 8)
        return data
    }

    static func decodeHeartbeat(_ data: Data) -> TerminalMultiplexHeartbeatRecord? {
        guard data.count == heartbeatBytes,
            let phase = TerminalMultiplexHandshakePhase(
                rawValue: TerminalWireBytes.byte(in: data, at: 0)
            ),
            let appState = TerminalMultiplexAppState(
                rawValue: TerminalWireBytes.byte(in: data, at: 1)
            ),
            TerminalWireBytes.uint16(in: data, at: 2) == 0
        else {
            return nil
        }
        return TerminalMultiplexHeartbeatRecord(
            phase: phase,
            appState: appState,
            senderQueueBytes: TerminalWireBytes.uint32(in: data, at: 4),
            monotonicMicroseconds: TerminalWireBytes.uint64(in: data, at: 8)
        )
    }
}
