import Foundation

actor RuntimeOrpcPeer {
    private let connection: AuthenticatedRuntimeConnection
    private var activeRequestID: String?

    init(connection: AuthenticatedRuntimeConnection) {
        self.connection = connection
    }

    func call<Input: Encodable, Output: Decodable>(
        path: String,
        input: Input,
        output: Output.Type
    ) async throws -> Output {
        guard activeRequestID == nil else { throw RuntimeOrpcError.requestAlreadyInFlight }
        let requestID = UUID().uuidString.lowercased()
        activeRequestID = requestID
        defer { activeRequestID = nil }

        let request = OrpcRequestEnvelope(
            i: requestID,
            p: OrpcRequestPayload(
                u: path,
                b: OrpcEncodableBody(json: input),
                h: [MobileRuntimeWireContract.requestIdHeader: requestID]
            )
        )
        let data = try JSONEncoder().encode(request)
        guard let payload = String(data: data, encoding: .utf8) else {
            throw RuntimeOrpcError.invalidMessage
        }
        try await connection.sendText(MobileRuntimeWireContract.textPrefix + payload)
        return try decodeResponse(
            try await connection.receiveText(),
            requestID: requestID,
            output: output
        )
    }

    func close() async {
        await connection.close()
    }

    private func decodeResponse<Output: Decodable>(
        _ message: String,
        requestID: String,
        output: Output.Type
    ) throws -> Output {
        guard message.hasPrefix(MobileRuntimeWireContract.textPrefix) else {
            throw RuntimeOrpcError.invalidMessage
        }
        let json = String(message.dropFirst(MobileRuntimeWireContract.textPrefix.count))
        let data = Data(json.utf8)
        let head = try JSONDecoder().decode(OrpcResponseHead.self, from: data)
        guard head.i == requestID, head.t == nil || head.t == 2 else {
            throw RuntimeOrpcError.unexpectedResponse
        }
        let status = head.p.s ?? 200
        guard status >= 200 && status < 400 else {
            let error = try? JSONDecoder().decode(OrpcErrorEnvelope.self, from: data)
            throw RuntimeOrpcError.server(status: status, code: error?.p.b.json.code)
        }
        let response = try JSONDecoder().decode(OrpcResponseEnvelope<Output>.self, from: data)
        return response.p.b.json
    }
}

nonisolated enum RuntimeOrpcError: Error {
    case requestAlreadyInFlight
    case invalidMessage
    case unexpectedResponse
    case server(status: Int, code: String?)
}

nonisolated private struct OrpcRequestEnvelope<Input: Encodable>: Encodable {
    let i: String
    let p: OrpcRequestPayload<Input>
}

nonisolated private struct OrpcRequestPayload<Input: Encodable>: Encodable {
    let u: String
    let b: OrpcEncodableBody<Input>
    let h: [String: String]
}

nonisolated private struct OrpcEncodableBody<Value: Encodable>: Encodable {
    let json: Value
}

nonisolated private struct OrpcResponseHead: Decodable {
    let i: String
    let t: Int?
    let p: OrpcResponseHeadPayload
}

nonisolated private struct OrpcResponseHeadPayload: Decodable {
    let s: Int?
}

nonisolated private struct OrpcResponseEnvelope<Output: Decodable>: Decodable {
    let p: OrpcResponsePayload<Output>
}

nonisolated private struct OrpcResponsePayload<Output: Decodable>: Decodable {
    let b: OrpcDecodableBody<Output>
}

nonisolated private struct OrpcDecodableBody<Value: Decodable>: Decodable {
    let json: Value
}

nonisolated private struct OrpcErrorEnvelope: Decodable {
    let p: OrpcErrorPayload
}

nonisolated private struct OrpcErrorPayload: Decodable {
    let b: OrpcDecodableBody<OrpcErrorWire>
}

nonisolated private struct OrpcErrorWire: Decodable {
    let code: String
}
