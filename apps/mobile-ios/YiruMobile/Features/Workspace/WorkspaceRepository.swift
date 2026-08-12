nonisolated protocol WorkspaceRepository: Sendable {
    func workspaces(for hostID: String) async throws -> WorkspaceSnapshot
    func reconnect(hostID: String) async
}

nonisolated enum WorkspaceRepositoryError: Error {
    case hostNotFound
    case timeout
}
