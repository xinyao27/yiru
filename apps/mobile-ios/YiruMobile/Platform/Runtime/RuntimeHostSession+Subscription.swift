import Foundation

extension RuntimeHostSession {
    func subscribe<Input: Encodable & Sendable, Output: Decodable & Sendable>(
        path: String,
        input: Input,
        output: Output.Type
    ) async throws -> AsyncThrowingStream<Output, Error> {
        let activePeer = try await connectIfNeeded()
        let generation = connectionGeneration
        let source = try await activePeer.subscribe(path: path, input: input, output: output)
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
                await invalidate(generation: generation)
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in forwardingTask.cancel() }
        return stream
    }
}

nonisolated enum RuntimeSessionError: Error {
    case authenticationFailed
    case timeout
    case closed
}
