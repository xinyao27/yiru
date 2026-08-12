import Foundation

nonisolated protocol TerminalWorkspaceRepository: Sendable {
    func workspaceTabs(for hostID: String, worktreeID: String) async throws
        -> TerminalWorkspaceSnapshot
    func workspaceTabUpdates(for hostID: String, worktreeID: String) async throws
        -> AsyncThrowingStream<TerminalWorkspaceSnapshot, Error>
    func activateWorkspaceTab(
        for hostID: String,
        worktreeID: String,
        tabID: String,
        leafID: String?
    ) async throws -> TerminalWorkspaceSnapshot
    func createWorkspaceTerminal(
        for hostID: String,
        worktreeID: String,
        afterTabID: String?
    ) async throws -> TerminalWorkspaceSnapshot
    func closeWorkspaceTab(
        for hostID: String,
        worktreeID: String,
        tabID: String,
        leafID: String?
    ) async throws -> TerminalWorkspaceSnapshot
    func reconnectWorkspaceHost(hostID: String) async
}

nonisolated enum TerminalWorkspaceRepositoryError: Error {
    case hostNotFound
    case rejectedMutation
    case timeout
}
