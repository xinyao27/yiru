import Foundation

nonisolated struct TerminalMultiplexAckRecord: Equatable, Sendable {
    let kind: UInt8
    let status: UInt8
    let errorCode: UInt16
    let acknowledgedBytes: UInt32
    let cumulativeSequence: UInt64
    let receiverQueueBytes: UInt32
}

nonisolated struct TerminalMultiplexCreditRecord: Equatable, Sendable {
    let direction: UInt8
    let reason: UInt8
    let maxInFlightBytes: UInt32
    let acknowledgeEveryBytes: UInt32
    let maxFrameBytes: UInt32
}

nonisolated struct TerminalMultiplexVisibilityRecord: Equatable, Sendable {
    let isVisible: Bool
    let hasDeliveryInterest: Bool
    let priority: UInt8
    let stateVersion: UInt32
}

nonisolated struct TerminalMultiplexKillRecord: Equatable, Sendable {
    let keepHistory: Bool
}

nonisolated struct TerminalMultiplexInputRecord: Equatable, Sendable {
    let kind: UInt8
    let data: Data
}

nonisolated enum TerminalMultiplexFlowRecordCodec {
    static func encode(_ record: TerminalMultiplexAckRecord) -> Data? {
        guard record.kind <= 3, record.status <= 3 else { return nil }
        var data = Data(repeating: 0, count: 24)
        data[0] = record.kind
        data[1] = record.status
        TerminalWireBytes.write(record.errorCode, to: &data, at: 2)
        TerminalWireBytes.write(record.acknowledgedBytes, to: &data, at: 4)
        TerminalWireBytes.write(record.cumulativeSequence, to: &data, at: 8)
        TerminalWireBytes.write(record.receiverQueueBytes, to: &data, at: 16)
        return data
    }

    static func decodeAck(_ data: Data) -> TerminalMultiplexAckRecord? {
        guard data.count == 24,
            TerminalWireBytes.byte(in: data, at: 0) <= 3,
            TerminalWireBytes.byte(in: data, at: 1) <= 3,
            TerminalWireBytes.uint32(in: data, at: 20) == 0
        else {
            return nil
        }
        return TerminalMultiplexAckRecord(
            kind: TerminalWireBytes.byte(in: data, at: 0),
            status: TerminalWireBytes.byte(in: data, at: 1),
            errorCode: TerminalWireBytes.uint16(in: data, at: 2),
            acknowledgedBytes: TerminalWireBytes.uint32(in: data, at: 4),
            cumulativeSequence: TerminalWireBytes.uint64(in: data, at: 8),
            receiverQueueBytes: TerminalWireBytes.uint32(in: data, at: 16)
        )
    }

    static func encode(_ record: TerminalMultiplexCreditRecord) -> Data? {
        guard record.direction <= 1, record.reason <= 3 else { return nil }
        var data = Data(repeating: 0, count: 16)
        data[0] = record.direction
        data[1] = record.reason
        TerminalWireBytes.write(record.maxInFlightBytes, to: &data, at: 4)
        TerminalWireBytes.write(record.acknowledgeEveryBytes, to: &data, at: 8)
        TerminalWireBytes.write(record.maxFrameBytes, to: &data, at: 12)
        return data
    }

    static func decodeCredit(_ data: Data) -> TerminalMultiplexCreditRecord? {
        guard data.count == 16,
            TerminalWireBytes.byte(in: data, at: 0) <= 1,
            TerminalWireBytes.byte(in: data, at: 1) <= 3,
            TerminalWireBytes.uint16(in: data, at: 2) == 0
        else {
            return nil
        }
        return TerminalMultiplexCreditRecord(
            direction: TerminalWireBytes.byte(in: data, at: 0),
            reason: TerminalWireBytes.byte(in: data, at: 1),
            maxInFlightBytes: TerminalWireBytes.uint32(in: data, at: 4),
            acknowledgeEveryBytes: TerminalWireBytes.uint32(in: data, at: 8),
            maxFrameBytes: TerminalWireBytes.uint32(in: data, at: 12)
        )
    }

    static func encode(_ record: TerminalMultiplexVisibilityRecord) -> Data? {
        guard record.priority <= 2 else { return nil }
        var data = Data(repeating: 0, count: 8)
        data[0] = record.isVisible ? 1 : 0
        data[1] = record.hasDeliveryInterest ? 1 : 0
        data[2] = record.priority
        TerminalWireBytes.write(record.stateVersion, to: &data, at: 4)
        return data
    }

    static func decodeVisibility(_ data: Data) -> TerminalMultiplexVisibilityRecord? {
        guard data.count == 8,
            let isVisible = bool(TerminalWireBytes.byte(in: data, at: 0)),
            let hasDeliveryInterest = bool(TerminalWireBytes.byte(in: data, at: 1)),
            TerminalWireBytes.byte(in: data, at: 2) <= 2,
            TerminalWireBytes.byte(in: data, at: 3) == 0
        else {
            return nil
        }
        return TerminalMultiplexVisibilityRecord(
            isVisible: isVisible,
            hasDeliveryInterest: hasDeliveryInterest,
            priority: TerminalWireBytes.byte(in: data, at: 2),
            stateVersion: TerminalWireBytes.uint32(in: data, at: 4)
        )
    }

    static func encode(_ record: TerminalMultiplexKillRecord) -> Data {
        var data = Data(repeating: 0, count: 8)
        data[0] = record.keepHistory ? 1 : 0
        data[1] = 1
        return data
    }

    static func decodeKill(_ data: Data) -> TerminalMultiplexKillRecord? {
        guard data.count == 8,
            let keepHistory = bool(TerminalWireBytes.byte(in: data, at: 0)),
            TerminalWireBytes.byte(in: data, at: 1) == 1,
            TerminalWireBytes.uint16(in: data, at: 2) == 0,
            TerminalWireBytes.uint32(in: data, at: 4) == 0
        else {
            return nil
        }
        return TerminalMultiplexKillRecord(keepHistory: keepHistory)
    }

    static func encode(_ record: TerminalMultiplexInputRecord) -> Data? {
        guard record.kind <= 1, String(data: record.data, encoding: .utf8) != nil else {
            return nil
        }
        var data = Data(repeating: 0, count: 8)
        data[0] = record.kind
        TerminalWireBytes.write(UInt32(record.data.count), to: &data, at: 4)
        data.append(record.data)
        return data
    }

    static func decodeInput(_ data: Data) -> TerminalMultiplexInputRecord? {
        guard data.count >= 8,
            TerminalWireBytes.byte(in: data, at: 0) <= 1,
            TerminalWireBytes.byte(in: data, at: 1) == 0,
            TerminalWireBytes.uint16(in: data, at: 2) == 0,
            Int(TerminalWireBytes.uint32(in: data, at: 4)) == data.count - 8
        else {
            return nil
        }
        let input = data.subdata(in: 8..<data.count)
        guard String(data: input, encoding: .utf8) != nil else { return nil }
        return TerminalMultiplexInputRecord(
            kind: TerminalWireBytes.byte(in: data, at: 0),
            data: input
        )
    }

    private static func bool(_ value: UInt8) -> Bool? {
        switch value {
        case 0: false
        case 1: true
        default: nil
        }
    }
}
