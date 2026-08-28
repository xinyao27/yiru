import Foundation

extension RuntimeHostSession {
    func subscribe<Input: Encodable & Sendable, Output: Decodable & Sendable>(
        path: String,
        input: Input,
        output: Output.Type
    ) async throws -> AsyncThrowingStream<Output, Error> {
        let activePeer = try await connectIfNeeded()
        let generation = connectionGeneration
        let source: AsyncThrowingStream<Output, Error>
        do {
            source = try await activePeer.subscribe(path: path, input: input, output: output)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            if isRuntimeConnectionFailure(error) {
                await invalidate(generation: generation)
            }
            throw error
        }
        let (stream, continuation) = AsyncThrowingStream.makeStream(of: Output.self)
        let forwardingTask = Task {
            do {
                for try await event in source {
                    continuation.yield(event)
                }
                continuation.finish()
            } catch is CancellationError {
                continuation.finish()
            } catch {
                if isRuntimeConnectionFailure(error) {
                    await invalidate(generation: generation)
                }
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in forwardingTask.cancel() }
        return stream
    }

    func subscribeWithBinary<Input: Encodable & Sendable, Output: Decodable & Sendable>(
        path: String,
        input: Input,
        output: Output.Type
    ) async throws -> RuntimeOrpcBinarySubscription<Output> {
        let activePeer = try await connectIfNeeded()
        let generation = connectionGeneration
        let source: RuntimeOrpcBinarySubscription<Output>
        do {
            source = try await activePeer.subscribeWithBinary(
                path: path,
                input: input,
                output: output
            )
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            if isRuntimeConnectionFailure(error) {
                await invalidate(generation: generation)
            }
            throw error
        }
        let (events, continuation) = AsyncThrowingStream.makeStream(of: Output.self)
        let forwardingTask = Task {
            do {
                for try await event in source.events {
                    continuation.yield(event)
                }
                continuation.finish()
            } catch is CancellationError {
                continuation.finish()
            } catch {
                if isRuntimeConnectionFailure(error) {
                    await invalidate(generation: generation)
                }
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in forwardingTask.cancel() }
        return RuntimeOrpcBinarySubscription(events: events, binary: source.binary)
    }
}

nonisolated enum RuntimeSessionError: LocalizedError {
    case authenticationFailed
    case timeout
    case closed

    var errorDescription: String? {
        switch self {
        case .authenticationFailed: "The daemon authentication failed."
        case .timeout: "The daemon request timed out."
        case .closed: "The daemon connection closed."
        }
    }
}
