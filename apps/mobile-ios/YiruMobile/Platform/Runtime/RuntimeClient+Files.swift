import Foundation

extension RuntimeClient: WorkspaceFilesRepository {
    func loadWorkspaceDirectory(
        for hostID: String,
        worktreeID: String,
        relativePath: String
    ) async throws -> WorkspaceDirectoryLoad {
        do {
            do {
                let wire: [MobileFileDirectoryEntryWire] = try await callRuntime(
                    hostID: hostID,
                    path: MobileSessionTabsWireContract.fileReadDirectoryPath,
                    input: MobileFileDirectoryRequestWire(
                        worktree: "id:\(worktreeID)",
                        relativePath: relativePath
                    ),
                    output: [MobileFileDirectoryEntryWire].self
                )
                return .entries(
                    wire.map {
                        WorkspaceDirectoryEntry(
                            name: $0.name,
                            isDirectory: $0.isDirectory,
                            isSymlink: $0.isSymlink
                        )
                    }
                )
            } catch let error as RuntimeOrpcError
                where relativePath.isEmpty && isFilesMethodUnavailable(error)
            {
                let wire: MobileFileListResultWire = try await callRuntime(
                    hostID: hostID,
                    path: MobileSessionTabsWireContract.fileListPath,
                    input: MobileSessionTabsWorktreeRequestWire(worktree: "id:\(worktreeID)"),
                    output: MobileFileListResultWire.self
                )
                return .legacy(
                    files: wire.files.map {
                        WorkspaceLegacyFile(
                            relativePath: $0.relativePath,
                            basename: $0.basename,
                            kind: $0.kind
                        )
                    },
                    isTruncated: wire.truncated
                )
            }
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw WorkspaceFilesLoadFailure(
                message: workspaceFilesFailureMessage(error),
                isConnectionFailure: isRuntimeConnectionFailure(error)
            )
        }
    }

    func reconnectWorkspaceFiles(for hostID: String) async {
        await reconnect(hostID: hostID)
    }
}

nonisolated private func isFilesMethodUnavailable(_ error: RuntimeOrpcError) -> Bool {
    error.serverCode == "forbidden"
        || error.serverCode == "method_not_found"
        || error.serverMessage?.contains("not available to mobile clients") == true
}

nonisolated private func workspaceFilesFailureMessage(_ error: Error) -> String {
    if let message = (error as? RuntimeOrpcError)?.serverMessage,
        !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
        return message
    }
    return String(localized: "Unable to load files")
}
