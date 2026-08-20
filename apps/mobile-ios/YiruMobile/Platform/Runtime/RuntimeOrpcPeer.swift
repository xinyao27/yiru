import Foundation

actor RuntimeOrpcPeer {
    private let connection: AuthenticatedRuntimeConnection
    private var pending: [String: PendingRequest] = [:]
    private var pendingLegacyStatus: [String: PendingRequest] = [:]
    private var subscriptions: [String: PendingSubscription] = [:]
    private var binarySubscriber: PendingBinarySubscriber?
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
                        self.fail(requestID: requestID, error: error)
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

    func probeStatusForProtocolCompatibility<Output: Decodable>(
        deviceToken: String,
        output: Output.Type
    ) async throws -> Output {
        guard !isClosed else { throw RuntimeOrpcError.closed }
        startReceivingIfNeeded()
        let requestID = UUID().uuidString.lowercased()
        let request = LegacyStatusProbeEnvelope(
            id: requestID,
            deviceToken: deviceToken,
            method: "status.get"
        )
        let data = try JSONEncoder().encode(request)
        guard let payload = String(data: data, encoding: .utf8) else {
            throw RuntimeOrpcError.invalidMessage
        }

        return try await withTaskCancellationHandler {
            let response = try await withCheckedThrowingContinuation {
                (continuation: CheckedContinuation<Data, Error>) in
                pendingLegacyStatus[requestID] = PendingRequest(continuation: continuation)
                Task {
                    do {
                        try await connection.sendText(payload)
                    } catch {
                        self.failLegacyStatus(requestID: requestID, error: error)
                    }
                }
            }
            let envelope = try JSONDecoder().decode(
                LegacyStatusResponseEnvelope<Output>.self,
                from: response
            )
            guard envelope.id == requestID else { throw RuntimeOrpcError.invalidMessage }
            guard envelope.ok, let result = envelope.result else {
                throw RuntimeOrpcError.server(
                    status: 500,
                    code: envelope.error?.code,
                    message: envelope.error?.message
                )
            }
            return result
        } onCancel: {
            Task {
                await self.failLegacyStatus(
                    requestID: requestID,
                    error: CancellationError()
                )
            }
        }
    }

    func subscribe<Input: Encodable, Output: Decodable & Sendable>(
        path: String,
        input: Input,
        output: Output.Type
    ) async throws -> AsyncThrowingStream<Output, Error> {
        guard !isClosed else { throw RuntimeOrpcError.closed }
        startReceivingIfNeeded()
        let requestID = UUID().uuidString.lowercased()
        let (stream, continuation) = AsyncThrowingStream.makeStream(of: Output.self)
        subscriptions[requestID] = PendingSubscription(
            isConfirmed: false,
            yieldEvent: { data in
                do {
                    continuation.yield(try decodeEvent(data, output: output))
                    return nil
                } catch {
                    return error
                }
            },
            finish: { error in
                if let error {
                    continuation.finish(throwing: error)
                } else {
                    continuation.finish()
                }
            }
        )
        continuation.onTermination = { [weak self] _ in
            Task { await self?.cancelSubscription(requestID: requestID) }
        }

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
            finishSubscription(requestID: requestID, error: RuntimeOrpcError.invalidMessage)
            throw RuntimeOrpcError.invalidMessage
        }
        do {
            try await connection.sendText(MobileRuntimeWireContract.textPrefix + payload)
        } catch {
            finishSubscription(requestID: requestID, error: error)
            throw error
        }
        return stream
    }

    func subscribeWithBinary<Input: Encodable, Output: Decodable & Sendable>(
        path: String,
        input: Input,
        output: Output.Type
    ) async throws -> RuntimeOrpcBinarySubscription<Output> {
        let subscriberID = UUID()
        let (binary, continuation) = AsyncThrowingStream.makeStream(of: Data.self)
        binarySubscriber?.continuation.finish()
        binarySubscriber = PendingBinarySubscriber(id: subscriberID, continuation: continuation)
        continuation.onTermination = { [weak self] _ in
            Task { await self?.removeBinarySubscriber(subscriberID) }
        }
        do {
            let events = try await subscribe(path: path, input: input, output: output)
            return RuntimeOrpcBinarySubscription(events: events, binary: binary)
        } catch {
            removeBinarySubscriber(subscriberID)
            throw error
        }
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
                case .binary(let data):
                    binarySubscriber?.continuation.yield(data)
                }
            }
        } catch is CancellationError {
            failAll(with: CancellationError())
        } catch {
            // Why: frame decoding failures mean the peer stream is unusable. Response-body
            // decoding happens after dispatch and remains a request-local protocol error.
            failAll(with: RuntimeOrpcError.invalidMessage)
        }
        if !isClosed {
            isClosed = true
            await connection.close()
        }
    }

    private func receiveText(_ message: String) throws {
        guard message.hasPrefix(MobileRuntimeWireContract.textPrefix) else {
            let data = Data(message.utf8)
            guard let head = try? JSONDecoder().decode(LegacyStatusResponseHead.self, from: data)
            else { return }
            pendingLegacyStatus.removeValue(forKey: head.id)?.continuation.resume(
                returning: data
            )
            return
        }
        let data = Data(message.dropFirst(MobileRuntimeWireContract.textPrefix.count).utf8)
        let head = try JSONDecoder().decode(OrpcResponseHead.self, from: data)
        if head.t == OrpcPeerMessageType.eventIterator.rawValue {
            receiveSubscriptionEvent(requestID: head.i, data: data)
        } else if head.t == OrpcPeerMessageType.abortSignal.rawValue {
            finishSubscription(requestID: head.i, error: RuntimeOrpcError.closed)
        } else if subscriptions[head.i] != nil {
            confirmSubscription(requestID: head.i, data: data, head: head)
        } else {
            pending.removeValue(forKey: head.i)?.continuation.resume(returning: data)
        }
    }

    private func fail(requestID: String, error: Error) {
        pending.removeValue(forKey: requestID)?.continuation.resume(throwing: error)
    }

    private func failLegacyStatus(requestID: String, error: Error) {
        pendingLegacyStatus.removeValue(forKey: requestID)?.continuation.resume(throwing: error)
    }

    private func failAll(with error: Error) {
        let requests = pending.values
        pending.removeAll()
        requests.forEach { $0.continuation.resume(throwing: error) }
        let legacyStatusRequests = pendingLegacyStatus.values
        pendingLegacyStatus.removeAll()
        legacyStatusRequests.forEach { $0.continuation.resume(throwing: error) }
        let activeSubscriptions = subscriptions.values
        subscriptions.removeAll()
        activeSubscriptions.forEach { $0.finish(error) }
        binarySubscriber?.continuation.finish(throwing: error)
        binarySubscriber = nil
    }

    private func confirmSubscription(requestID: String, data: Data, head: OrpcResponseHead) {
        guard var subscription = subscriptions[requestID] else { return }
        let status = head.p?.s ?? 200
        guard status >= 200 && status < 400 else {
            let error = try? JSONDecoder().decode(OrpcErrorEnvelope.self, from: data)
            finishSubscription(
                requestID: requestID,
                error: RuntimeOrpcError.server(
                    status: status,
                    code: error?.p.b.json.code,
                    message: error?.p.b.json.message
                )
            )
            return
        }
        let contentType = head.p?.h?.first { $0.key.lowercased() == "content-type" }?.value
        guard contentType?.hasPrefix("text/event-stream") == true else {
            finishSubscription(requestID: requestID, error: RuntimeOrpcError.unexpectedResponse)
            return
        }
        subscription.isConfirmed = true
        subscriptions[requestID] = subscription
    }

    private func receiveSubscriptionEvent(requestID: String, data: Data) {
        guard let subscription = subscriptions[requestID], subscription.isConfirmed else { return }
        guard let event = try? JSONDecoder().decode(OrpcEventHead.self, from: data) else {
            rejectSubscription(requestID: requestID, error: RuntimeOrpcError.invalidMessage)
            return
        }
        switch event.p.e {
        case .message:
            if let error = subscription.yieldEvent(data) {
                rejectSubscription(requestID: requestID, error: error)
            }
        case .error:
            let error = try? JSONDecoder().decode(OrpcEventErrorEnvelope.self, from: data)
            finishSubscription(
                requestID: requestID,
                error: RuntimeOrpcError.server(
                    status: 500,
                    code: error?.p.d?.json.code,
                    message: error?.p.d?.json.message
                )
            )
        case .done:
            finishSubscription(requestID: requestID, error: nil)
        }
    }

    private func finishSubscription(requestID: String, error: Error?) {
        subscriptions.removeValue(forKey: requestID)?.finish(error)
    }

    private func rejectSubscription(requestID: String, error: Error) {
        guard let subscription = subscriptions.removeValue(forKey: requestID) else { return }
        subscription.finish(error)
        Task { await sendAbort(requestID: requestID) }
    }

    private func cancelSubscription(requestID: String) async {
        guard subscriptions.removeValue(forKey: requestID) != nil, !isClosed else { return }
        await sendAbort(requestID: requestID)
    }

    private func removeBinarySubscriber(_ id: UUID) {
        guard binarySubscriber?.id == id else { return }
        binarySubscriber = nil
    }

    private func sendAbort(requestID: String) async {
        guard !isClosed else { return }
        let abort = OrpcAbortEnvelope(
            i: requestID,
            t: OrpcPeerMessageType.abortSignal.rawValue
        )
        guard
            let data = try? JSONEncoder().encode(abort),
            let payload = String(data: data, encoding: .utf8)
        else { return }
        try? await connection.sendText(MobileRuntimeWireContract.textPrefix + payload)
    }
}

nonisolated enum RuntimeOrpcError: LocalizedError {
    case invalidMessage
    case unexpectedResponse
    case server(status: Int, code: String?, message: String?)
    case closed

    var serverMessage: String? {
        guard case .server(_, _, let message) = self else { return nil }
        return message
    }

    var serverCode: String? {
        guard case .server(_, let code, _) = self else { return nil }
        return code
    }

    var errorDescription: String? {
        switch self {
        case .invalidMessage:
            String(localized: "Desktop returned an invalid response")
        case .unexpectedResponse:
            String(localized: "Desktop returned an unexpected response")
        case .server(let status, let code, let message):
            if let message = message?.trimmingCharacters(in: .whitespacesAndNewlines),
                !message.isEmpty
            {
                message
            } else if let code = code?.trimmingCharacters(in: .whitespacesAndNewlines),
                !code.isEmpty
            {
                String(localized: "Desktop request failed: \(code)")
            } else {
                String(localized: "Desktop request failed with status \(status)")
            }
        case .closed:
            String(localized: "The desktop connection closed")
        }
    }
}

nonisolated private struct PendingRequest {
    let continuation: CheckedContinuation<Data, Error>
}

nonisolated private struct LegacyStatusProbeEnvelope: Encodable {
    let id: String
    let deviceToken: String
    let method: String
}

nonisolated private struct LegacyStatusResponseHead: Decodable {
    let id: String
}

nonisolated private struct LegacyStatusResponseEnvelope<Result: Decodable>: Decodable {
    let id: String
    let ok: Bool
    let result: Result?
    let error: LegacyStatusErrorEnvelope?
}

nonisolated private struct LegacyStatusErrorEnvelope: Decodable {
    let code: String
    let message: String
}

nonisolated private struct PendingSubscription: Sendable {
    var isConfirmed: Bool
    let yieldEvent: @Sendable (Data) -> Error?
    let finish: @Sendable (Error?) -> Void
}

nonisolated private struct PendingBinarySubscriber: Sendable {
    let id: UUID
    let continuation: AsyncThrowingStream<Data, Error>.Continuation
}

nonisolated struct RuntimeOrpcBinarySubscription<Event: Sendable>: Sendable {
    let events: AsyncThrowingStream<Event, Error>
    let binary: AsyncThrowingStream<Data, Error>
}

nonisolated private enum OrpcPeerMessageType: Int {
    case eventIterator = 3
    case abortSignal = 4
}
