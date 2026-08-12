import Foundation

nonisolated func decodeResponse<Output: Decodable>(
    _ data: Data,
    requestID: String,
    output: Output.Type
) throws -> Output {
    let head = try JSONDecoder().decode(OrpcResponseHead.self, from: data)
    guard head.i == requestID, head.t == nil || head.t == 2 else {
        throw RuntimeOrpcError.unexpectedResponse
    }
    let status = head.p?.s ?? 200
    guard status >= 200 && status < 400 else {
        let error = try? JSONDecoder().decode(OrpcErrorEnvelope.self, from: data)
        throw RuntimeOrpcError.server(status: status, code: error?.p.b.json.code)
    }
    return try JSONDecoder().decode(OrpcResponseEnvelope<Output>.self, from: data).p.b.json
}

nonisolated func decodeEvent<Output: Decodable>(
    _ data: Data,
    output: Output.Type
) throws -> Output {
    try JSONDecoder().decode(OrpcEventEnvelope<Output>.self, from: data).p.d.json
}

nonisolated struct OrpcRequestEnvelope<Input: Encodable>: Encodable {
    let i: String
    let p: OrpcRequestPayload<Input>
}

nonisolated struct OrpcRequestPayload<Input: Encodable>: Encodable {
    let u: String
    let b: OrpcEncodableBody<Input>
    let h: [String: String]
}

nonisolated struct OrpcEncodableBody<Value: Encodable>: Encodable {
    let json: Value
}

nonisolated struct OrpcResponseHead: Decodable {
    let i: String
    let t: Int?
    let p: OrpcResponseHeadPayload?
}

nonisolated struct OrpcResponseHeadPayload: Decodable {
    let s: Int?
    let h: [String: String]?
}

nonisolated struct OrpcAbortEnvelope: Encodable {
    let i: String
    let t: Int
}

nonisolated struct OrpcEventHead: Decodable {
    let p: OrpcEventHeadPayload
}

nonisolated struct OrpcEventHeadPayload: Decodable {
    let e: OrpcEventKind
}

nonisolated enum OrpcEventKind: String, Decodable {
    case message
    case error
    case done
}

nonisolated struct OrpcEventEnvelope<Output: Decodable>: Decodable {
    let p: OrpcEventPayload<Output>
}

nonisolated struct OrpcEventPayload<Output: Decodable>: Decodable {
    let d: OrpcDecodableBody<Output>
}

nonisolated struct OrpcEventErrorEnvelope: Decodable {
    let p: OrpcEventErrorPayload
}

nonisolated struct OrpcEventErrorPayload: Decodable {
    let d: OrpcDecodableBody<OrpcErrorWire>?
}

nonisolated struct OrpcResponseEnvelope<Output: Decodable>: Decodable {
    let p: OrpcResponsePayload<Output>
}

nonisolated struct OrpcResponsePayload<Output: Decodable>: Decodable {
    let b: OrpcDecodableBody<Output>
}

nonisolated struct OrpcDecodableBody<Value: Decodable>: Decodable {
    let json: Value
}

nonisolated struct OrpcErrorEnvelope: Decodable {
    let p: OrpcErrorPayload
}

nonisolated struct OrpcErrorPayload: Decodable {
    let b: OrpcDecodableBody<OrpcErrorWire>
}

nonisolated struct OrpcErrorWire: Decodable {
    let code: String
}
