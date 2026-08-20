import Foundation

extension RuntimeClient: TerminalFileRepository {
    func resolveTerminalFile(_ request: TerminalFileOpenRequest) async throws
        -> TerminalFileDestination?
    {
        let result: MobileFilesResolveResultWire = try await callRuntime(
            hostID: request.hostID,
            path: MobileFilesWireContract.resolveTerminalPathPath,
            input: MobileFilesResolveRequestWire(
                worktree: "id:\(request.worktreeID)",
                pathText: request.tappedFile.pathText,
                terminal: request.terminalID,
                cwd: request.cwd
            ),
            output: MobileFilesResolveResultWire.self
        )
        guard result.exists, !result.isDirectory, let target = result.openTarget else { return nil }
        switch target.kind {
        case "worktree-file":
            guard let relativePath = target.relativePath, let absolutePath = target.absolutePath,
                let provider = target.provider
            else { return nil }
            return .worktree(
                relativePath: relativePath,
                absolutePath: absolutePath,
                provider: provider
            )
        case "absolute-file":
            guard let absolutePath = target.absolutePath, let grantID = target.grantId else {
                return nil
            }
            return .artifact(
                TerminalArtifactSource(
                    hostID: request.hostID,
                    worktreeID: request.worktreeID,
                    absolutePath: absolutePath,
                    grantID: grantID,
                    terminalID: request.terminalID,
                    pathText: request.tappedFile.pathText,
                    cwd: request.cwd
                )
            )
        default:
            return nil
        }
    }

    func openTerminalWorktreeFile(
        for hostID: String,
        worktreeID: String,
        relativePath: String
    ) async throws {
        let result: MobileFileOpenResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.fileOpenPath,
            input: MobileFileReadRequestWire(
                worktree: "id:\(worktreeID)",
                relativePath: relativePath
            ),
            output: MobileFileOpenResultWire.self
        )
        guard result.opened else { throw TerminalArtifactError.unavailable }
    }

    func loadTerminalArtifact(_ source: TerminalArtifactSource) async throws -> TerminalArtifactLoad
    {
        do {
            return try await loadTerminalArtifactOnce(source)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            guard isTerminalArtifactGrantFailure(error) else { throw error }
            guard let refreshed = try? await refreshTerminalArtifactSource(source) else {
                throw error
            }
            return try await loadTerminalArtifactOnce(refreshed)
        }
    }

    func saveTerminalArtifact(
        _ source: TerminalArtifactSource,
        content: String,
        baseContent: String
    ) async throws -> TerminalArtifactSource {
        var current = source
        do {
            let latest = try await loadTerminalArtifactOnce(current)
            current = latest.source
            guard case .text(let hostContent, _, _) = latest.document,
                hostContent == baseContent
            else { throw TerminalArtifactError.changedOnHost }
        } catch is TerminalArtifactError {
            throw TerminalArtifactError.changedOnHost
        } catch {
            guard isTerminalArtifactGrantFailure(error) else { throw error }
            current = try await refreshTerminalArtifactSource(current)
            let latest = try await loadTerminalArtifactOnce(current)
            guard case .text(let hostContent, _, _) = latest.document,
                hostContent == baseContent
            else { throw TerminalArtifactError.changedOnHost }
        }
        do {
            return try await writeTerminalArtifact(current, content: content)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            guard isTerminalArtifactGrantFailure(error) else { throw error }
            let refreshed = try await refreshTerminalArtifactSource(current)
            let latest = try await loadTerminalArtifactOnce(refreshed)
            guard case .text(let hostContent, _, _) = latest.document,
                hostContent == baseContent
            else { throw TerminalArtifactError.changedOnHost }
            return try await writeTerminalArtifact(refreshed, content: content)
        }
    }

    private func loadTerminalArtifactOnce(_ source: TerminalArtifactSource) async throws
        -> TerminalArtifactLoad
    {
        if terminalArtifactKind(source.absolutePath) == .image {
            let wire: MobileFilePreviewResultWire = try await callRuntime(
                hostID: source.hostID,
                path: MobileFilesWireContract.readTerminalArtifactPreviewPath,
                input: terminalArtifactRequest(source),
                output: MobileFilePreviewResultWire.self
            )
            guard wire.isBinary, wire.isImage == true,
                let data = Data(base64Encoded: wire.content)
            else { throw TerminalArtifactError.invalidImage }
            return TerminalArtifactLoad(
                source: source,
                document: .image(data: data, mimeType: wire.mimeType)
            )
        }
        let wire: MobileFileReadResultWire = try await callRuntime(
            hostID: source.hostID,
            path: MobileFilesWireContract.readTerminalArtifactPath,
            input: terminalArtifactRequest(source),
            output: MobileFileReadResultWire.self
        )
        let document: WorkspaceFileDocument =
            terminalArtifactKind(source.absolutePath) == .html
            ? .html(content: wire.content, isTruncated: wire.truncated)
            : .text(
                content: wire.content,
                isTruncated: wire.truncated,
                byteLength: wire.byteLength
            )
        return TerminalArtifactLoad(source: source, document: document)
    }

    private func refreshTerminalArtifactSource(_ source: TerminalArtifactSource) async throws
        -> TerminalArtifactSource
    {
        let request = TerminalFileOpenRequest(
            hostID: source.hostID,
            worktreeID: source.worktreeID,
            terminalID: source.terminalID,
            cwd: source.cwd,
            tappedFile: TerminalTappedFile(pathText: source.pathText, line: nil, column: nil)
        )
        guard case .artifact(let refreshed) = try await resolveTerminalFile(request),
            refreshed.absolutePath == source.absolutePath
        else { throw TerminalArtifactError.unavailable }
        return refreshed
    }

    private func writeTerminalArtifact(_ source: TerminalArtifactSource, content: String)
        async throws
        -> TerminalArtifactSource
    {
        let result: MobileFileMutationResultWire = try await callRuntime(
            hostID: source.hostID,
            path: MobileFilesWireContract.writeTerminalArtifactPath,
            input: MobileTerminalArtifactWriteRequestWire(
                worktree: "id:\(source.worktreeID)",
                grantId: source.grantID,
                absolutePath: source.absolutePath,
                content: content
            ),
            output: MobileFileMutationResultWire.self
        )
        guard result.ok else { throw TerminalArtifactError.unavailable }
        return source
    }
}

nonisolated private func isTerminalArtifactGrantFailure(_ error: Error) -> Bool {
    let normalized = error.localizedDescription.lowercased()
    return normalized.contains("terminal_file_grant_expired")
        || normalized.contains("terminal_file_grant_mismatch")
        || normalized.contains("terminal_file_grant_stale")
}

nonisolated private enum TerminalArtifactKind {
    case image
    case html
    case text
}

nonisolated private func terminalArtifactKind(_ path: String) -> TerminalArtifactKind {
    switch URL(fileURLWithPath: path).pathExtension.lowercased() {
    case "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico": .image
    case "html", "htm": .html
    default: .text
    }
}

nonisolated private func terminalArtifactRequest(_ source: TerminalArtifactSource)
    -> MobileTerminalArtifactRequestWire
{
    MobileTerminalArtifactRequestWire(
        worktree: "id:\(source.worktreeID)",
        grantId: source.grantID,
        absolutePath: source.absolutePath
    )
}
