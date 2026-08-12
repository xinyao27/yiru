import Foundation

nonisolated struct TerminalOutputChunk: Equatable, Sendable {
    let bytes: Data
    let endSequence: UInt64
}

nonisolated enum TerminalSessionEvent: Equatable, Sendable {
    case subscribed
    case displayMode(TerminalDisplayMode)
    case snapshot(TerminalReplaySnapshot)
    case output(TerminalOutputChunk)
    case clearBuffer
    case ended
}

nonisolated enum TerminalSessionAppState: Equatable, Sendable {
    case foreground
    case background
}

nonisolated protocol TerminalSession: Sendable {
    func events() async -> AsyncThrowingStream<TerminalSessionEvent, Error>
    func sendInput(_ data: Data) async throws
    func sendQueryReply(_ data: Data) async throws
    func resize(_ size: TerminalGridSize) async throws
    func acknowledgeOutput(endSequence: UInt64, receiverQueueBytes: UInt32) async throws
    func acknowledgeSnapshot(id: UInt32) async throws
    func setAppState(_ state: TerminalSessionAppState) async
    func close() async
}

nonisolated protocol TerminalSessionRuntime: Sendable {
    func openTerminalSession(hostID: String, terminalID: String) async throws
        -> any TerminalSession
}
