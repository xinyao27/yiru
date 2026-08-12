nonisolated protocol WorkspaceRepository: Sendable {
    func workspaces(for hostID: String) async throws -> WorkspaceSnapshot
}

nonisolated enum WorkspaceRepositoryError: Error {
    case hostNotFound
    case timeout
}
