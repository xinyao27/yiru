import Foundation

nonisolated struct RuntimeOrpcSideChannelFrame: Equatable, Sendable {
    let requestID: String
    let payload: Data
}

nonisolated enum RuntimeOrpcSideChannelError: Error, Equatable, Sendable {
    case invalidHeader
    case invalidRequestID
}

nonisolated enum RuntimeOrpcSideChannelCodec {
    static func encode(requestID: String, payload: Data) throws -> Data {
        let requestIDBytes = Data(requestID.utf8)
        guard !requestIDBytes.isEmpty, requestIDBytes.count <= Int(UInt16.max) else {
            throw RuntimeOrpcSideChannelError.invalidRequestID
        }
        var frame = Data(
            repeating: 0,
            count: MobileTerminalMultiplexWireContract.sideChannelHeaderBytes
                + requestIDBytes.count
        )
        frame[0] = MobileTerminalMultiplexWireContract.sideChannelKind
        frame[1] = MobileTerminalMultiplexWireContract.sideChannelVersion
        TerminalWireBytes.write(UInt16(requestIDBytes.count), to: &frame, at: 2)
        frame.replaceSubrange(
            MobileTerminalMultiplexWireContract.sideChannelHeaderBytes..<frame.count,
            with: requestIDBytes
        )
        frame.append(payload)
        return frame
    }

    static func decode(_ data: Data) throws -> RuntimeOrpcSideChannelFrame {
        let headerBytes = MobileTerminalMultiplexWireContract.sideChannelHeaderBytes
        guard data.count >= headerBytes,
            TerminalWireBytes.byte(in: data, at: 0)
                == MobileTerminalMultiplexWireContract.sideChannelKind,
            TerminalWireBytes.byte(in: data, at: 1)
                == MobileTerminalMultiplexWireContract.sideChannelVersion
        else {
            throw RuntimeOrpcSideChannelError.invalidHeader
        }
        let requestIDBytes = Int(TerminalWireBytes.uint16(in: data, at: 2))
        let payloadOffset = headerBytes + requestIDBytes
        guard requestIDBytes > 0, payloadOffset <= data.count,
            let requestID = String(
                data: data.subdata(in: headerBytes..<payloadOffset),
                encoding: .utf8
            ),
            !requestID.isEmpty
        else {
            throw RuntimeOrpcSideChannelError.invalidRequestID
        }
        return RuntimeOrpcSideChannelFrame(
            requestID: requestID,
            payload: data.subdata(in: payloadOffset..<data.count)
        )
    }
}
