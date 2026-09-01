import Foundation

extension RuntimeClient {
    func sourceFileMutation(
        _ hostID: String,
        _ worktreeID: String,
        _ path: String,
        _ operationPath: String
    ) async throws {
        let result: MobileGitMutationResultWire = try await callRuntime(
            hostID: hostID,
            path: operationPath,
            input: MobileGitFileRequestWire(
                worktree: sourceWorktreeID(worktreeID),
                filePath: path
            ),
            output: MobileGitMutationResultWire.self
        )
        guard result.ok else { throw SourceControlRepositoryError.rejectedMutation }
    }

    func sourceBulkMutation(
        _ hostID: String,
        _ worktreeID: String,
        _ paths: [String],
        _ operationPath: String
    ) async throws {
        let result: MobileGitMutationResultWire = try await callRuntime(
            hostID: hostID,
            path: operationPath,
            input: MobileGitBulkRequestWire(
                worktree: sourceWorktreeID(worktreeID),
                filePaths: paths
            ),
            output: MobileGitMutationResultWire.self
        )
        guard result.ok else { throw SourceControlRepositoryError.rejectedMutation }
    }

    func sourceWorktreeMutation(
        _ hostID: String,
        _ worktreeID: String,
        _ operationPath: String
    ) async throws {
        let result: MobileGitMutationResultWire = try await callRuntime(
            hostID: hostID,
            path: operationPath,
            input: sourceWorktreeRequest(worktreeID),
            output: MobileGitMutationResultWire.self
        )
        guard result.ok else { throw SourceControlRepositoryError.rejectedMutation }
    }
}
