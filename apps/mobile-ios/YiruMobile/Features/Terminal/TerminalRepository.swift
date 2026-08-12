nonisolated protocol TerminalRepository: Sendable {
    func terminals(for hostID: String, worktreeID: String) async throws -> TerminalSnapshot
    func reconnectTerminalHost(hostID: String) async
}

nonisolated enum TerminalRepositoryError: Error {
    case hostNotFound
    case timeout
}
