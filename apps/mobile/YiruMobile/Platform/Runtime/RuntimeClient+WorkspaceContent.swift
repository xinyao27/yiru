import Foundation

extension RuntimeClient: WorkspaceContentRepository {
    func createWorkspaceMarkdown(
        for hostID: String,
        worktreeID: String
    ) async throws -> TerminalWorkspaceSnapshot {
        let worktree = worktreeSelector(worktreeID)
        for attempt in 1...100 {
            let relativePath = attempt == 1 ? "untitled.md" : "untitled-\(attempt).md"
            do {
                let result: MobileFileMutationResultWire = try await callRuntime(
                    hostID: hostID,
                    path: MobileSessionTabsWireContract.fileCreatePath,
                    input: MobileFileReadRequestWire(
                        worktree: worktree,
                        relativePath: relativePath
                    ),
                    output: MobileFileMutationResultWire.self
                )
                guard result.ok else { throw TerminalWorkspaceRepositoryError.rejectedMutation }
            } catch let error as RuntimeOrpcError where isExistingFileError(error) && attempt < 100
            {
                continue
            }
            let opened: MobileFileOpenResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileSessionTabsWireContract.fileOpenPath,
                input: MobileFileReadRequestWire(
                    worktree: worktree,
                    relativePath: relativePath
                ),
                output: MobileFileOpenResultWire.self
            )
            guard opened.opened else { throw TerminalWorkspaceRepositoryError.rejectedMutation }
            try await Task.sleep(for: .milliseconds(300))
            return try await fetchWorkspaceTabs(for: hostID, worktreeID: worktreeID)
        }
        throw TerminalWorkspaceRepositoryError.rejectedMutation
    }

    func readWorkspaceMarkdown(
        for hostID: String,
        worktreeID: String,
        tab: TerminalWorkspaceTab,
        descriptor: WorkspaceMarkdownTab
    ) async throws -> WorkspaceMarkdownDocument {
        do {
            let wire: MobileMarkdownReadResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileSessionTabsWireContract.markdownReadPath,
                input: MobileMarkdownTabRequestWire(
                    worktree: worktreeSelector(worktreeID),
                    tabId: tab.id
                ),
                output: MobileMarkdownReadResultWire.self
            )
            return WorkspaceMarkdownDocument(
                content: wire.content,
                version: wire.version,
                editable: wire.editable,
                isHostDirty: wire.isDirty,
                readOnlyReason: wire.readOnlyReason.map(WorkspaceMarkdownReadOnlyReason.init(wire:))
            )
        } catch let error as RuntimeOrpcError
            where error.serverCode == "renderer_unavailable"
            || (error.serverCode == "runtime_error"
                && error.serverMessage == "renderer_unavailable")
        {
            let wire = try await readWorkspaceTextFile(
                for: hostID,
                worktreeID: worktreeID,
                relativePath: descriptor.relativePath
            )
            let reason: WorkspaceMarkdownReadOnlyReason =
                wire.truncated
                ? .diskFileTooLarge
                : descriptor.isHostDirty ? .desktopHasUnsavedChanges : .desktopUnavailable
            return WorkspaceMarkdownDocument(
                content: wire.content,
                version: "",
                editable: false,
                isHostDirty: descriptor.isHostDirty,
                readOnlyReason: reason
            )
        }
    }

    func saveWorkspaceMarkdown(
        for hostID: String,
        worktreeID: String,
        tabID: String,
        baseVersion: String,
        content: String
    ) async throws -> WorkspaceMarkdownDocument {
        let wire: MobileMarkdownSaveResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.markdownSavePath,
            input: MobileMarkdownSaveRequestWire(
                worktree: worktreeSelector(worktreeID),
                tabId: tabID,
                baseVersion: baseVersion,
                content: content
            ),
            output: MobileMarkdownSaveResultWire.self
        )
        return WorkspaceMarkdownDocument(
            content: wire.content,
            version: wire.version,
            editable: true,
            isHostDirty: false,
            readOnlyReason: nil
        )
    }

    func readWorkspaceFile(
        for hostID: String,
        worktreeID: String,
        descriptor: WorkspaceFileTab
    ) async throws -> WorkspaceFileDocument {
        if let diffSource = descriptor.diffSource {
            let wire: MobileGitDiffResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileSessionTabsWireContract.gitDiffPath,
                input: MobileGitDiffRequestWire(
                    worktree: worktreeSelector(worktreeID),
                    filePath: descriptor.relativePath,
                    staged: diffSource == .staged,
                    compareAgainstHead: nil
                ),
                output: MobileGitDiffResultWire.self
            )
            switch wire.kind {
            case .text:
                let result = WorkspaceDiffBuilder.build(
                    originalContent: wire.originalContent,
                    modifiedContent: wire.modifiedContent
                )
                return .diff(lines: result.lines, isTruncated: result.isTruncated)
            case .binary:
                guard wire.isImage == true else { throw WorkspaceContentError.unsupportedBinary }
                let encodedContent: String
                if !wire.modifiedContent.isEmpty {
                    encodedContent = wire.modifiedContent
                } else if wire.modifiedDeleted == true {
                    encodedContent = wire.originalContent
                } else {
                    throw WorkspaceContentError.invalidImage
                }
                guard let data = Data(base64Encoded: encodedContent) else {
                    throw WorkspaceContentError.invalidImage
                }
                return .image(data: data, mimeType: wire.mimeType)
            }
        }
        switch workspaceArtifactKind(descriptor.relativePath) {
        case .image:
            let wire: MobileFilePreviewResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileSessionTabsWireContract.fileReadPreviewPath,
                input: MobileFileReadRequestWire(
                    worktree: worktreeSelector(worktreeID),
                    relativePath: descriptor.relativePath
                ),
                output: MobileFilePreviewResultWire.self
            )
            guard wire.isImage == true, let data = Data(base64Encoded: wire.content) else {
                throw WorkspaceContentError.invalidImage
            }
            return .image(data: data, mimeType: wire.mimeType)
        case .html:
            let wire = try await readWorkspaceTextFile(
                for: hostID,
                worktreeID: worktreeID,
                relativePath: descriptor.relativePath
            )
            return .html(content: wire.content, isTruncated: wire.truncated)
        case .text:
            let wire = try await readWorkspaceTextFile(
                for: hostID,
                worktreeID: worktreeID,
                relativePath: descriptor.relativePath
            )
            return .text(
                content: wire.content,
                isTruncated: wire.truncated,
                byteLength: wire.byteLength
            )
        }
    }

    private func readWorkspaceTextFile(
        for hostID: String,
        worktreeID: String,
        relativePath: String
    ) async throws -> MobileFileReadResultWire {
        try await callRuntime(
            hostID: hostID,
            path: MobileSessionTabsWireContract.fileReadPath,
            input: MobileFileReadRequestWire(
                worktree: worktreeSelector(worktreeID),
                relativePath: relativePath
            ),
            output: MobileFileReadResultWire.self
        )
    }
}

nonisolated private enum WorkspaceArtifactKind {
    case image
    case html
    case text
}

nonisolated private func workspaceArtifactKind(_ path: String) -> WorkspaceArtifactKind {
    let fileExtension = URL(fileURLWithPath: path).pathExtension.lowercased()
    if ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"].contains(fileExtension) {
        return .image
    }
    if ["html", "htm"].contains(fileExtension) { return .html }
    return .text
}

nonisolated private func isExistingFileError(_ error: RuntimeOrpcError) -> Bool {
    let message = error.serverMessage?.lowercased() ?? ""
    return message.contains("eexist") || message.contains("already exists")
}

nonisolated private extension WorkspaceMarkdownReadOnlyReason {
    init(wire: MobileMarkdownReadOnlyReasonWire) {
        switch wire {
        case .unsupportedPreview: self = .unsupportedPreview
        case .unsupportedTab: self = .unsupportedTab
        case .unsupportedUntitled: self = .unsupportedUntitled
        case .fileTooLarge: self = .fileTooLarge
        }
    }
}
