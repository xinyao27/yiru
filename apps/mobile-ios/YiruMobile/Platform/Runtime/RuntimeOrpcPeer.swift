import Foundation

actor RuntimeOrpcPeer {
    private let connection: AuthenticatedRuntimeConnection
    private var pending: [String: PendingRequest] = [:]
    private var receiveTask: Task<Void, Never>?
    private var isClosed = false

    init(connection: AuthenticatedRuntimeConnection) {
        self.connection = connection
    }

    func call<Input: Encodable, Output: Decodable>(
        path: String,
        input: Input,
        output: Output.Type
    ) async throws -> Output {
        guard !isClosed else { throw RuntimeOrpcError.closed }
        startReceivingIfNeeded()
        let requestID = UUID().uuidString.lowercased()
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

        return try await withTaskCancellationHandler {
            let response = try await withCheckedThrowingContinuation {
                (continuation: CheckedContinuation<Data, Error>) in
                pending[requestID] = PendingRequest(continuation: continuation)
                Task {
                    do {
                        try await connection.sendText(
                            MobileRuntimeWireContract.textPrefix + payload)
                    } catch {
                        await self.fail(requestID: requestID, error: error)
                    }
                }
            }
            return try decodeResponse(response, requestID: requestID, output: output)
        } onCancel: {
            Task { await self.fail(requestID: requestID, error: CancellationError()) }
        }
    }

    func ping() async throws {
        guard !isClosed else { throw RuntimeOrpcError.closed }
        try await connection.ping()
    }

    func close() async {
        guard !isClosed else { return }
        isClosed = true
        receiveTask?.cancel()
        receiveTask = nil
        await connection.close()
        failAll(with: RuntimeOrpcError.closed)
    }

    private func startReceivingIfNeeded() {
        guard receiveTask == nil else { return }
        receiveTask = Task { [weak self] in
            guard let self else { return }
            await self.receiveLoop()
        }
    }

    private func receiveLoop() async {
        do {
            while !Task.isCancelled && !isClosed {
                switch try await connection.receive() {
                case .text(let message):
                    try receiveText(message)
                case .binary:
                    // Terminal multiplex owns binary dispatch once its transport is attached.
                    continue
                }
            }
        } catch is CancellationError {
            failAll(with: CancellationError())
        } catch {
            failAll(with: error)
        }
        if !isClosed {
            isClosed = true
            await connection.close()
        }
    }

    private func receiveText(_ message: String) throws {
        guard message.hasPrefix(MobileRuntimeWireContract.textPrefix) else { return }
        let data = Data(message.dropFirst(MobileRuntimeWireContract.textPrefix.count).utf8)
        let head = try JSONDecoder().decode(OrpcResponseHead.self, from: data)
        pending.removeValue(forKey: head.i)?.continuation.resume(returning: data)
    }

    private func fail(requestID: String, error: Error) {
        pending.removeValue(forKey: requestID)?.continuation.resume(throwing: error)
    }

    private func failAll(with error: Error) {
        let requests = pending.values
        pending.removeAll()
        requests.forEach { $0.continuation.resume(throwing: error) }
    }
}

nonisolated enum RuntimeOrpcError: Error {
    case invalidMessage
    case unexpectedResponse
    case server(status: Int, code: String?)
    case closed
}

nonisolated private struct PendingRequest {
    let continuation: CheckedContinuation<Data, Error>
}

nonisolated private func decodeResponse<Output: Decodable>(
    _ data: Data,
    requestID: String,
    output: Output.Type
) throws -> Output {
    let head = try JSONDecoder().decode(OrpcResponseHead.self, from: data)
    guard head.i == requestID, head.t == nil || head.t == 2 else {
        throw RuntimeOrpcError.unexpectedResponse
    }
    let status = head.p.s ?? 200
    guard status >= 200 && status < 400 else {
        let error = try? JSONDecoder().decode(OrpcErrorEnvelope.self, from: data)
        throw RuntimeOrpcError.server(status: status, code: error?.p.b.json.code)
    }
    return try JSONDecoder().decode(OrpcResponseEnvelope<Output>.self, from: data).p.b.json
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
