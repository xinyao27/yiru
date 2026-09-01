import Foundation

extension RuntimeClient {
    func sourceBranchCompare(
        for hostID: String,
        worktreeID: String,
        baseRef: String
    ) async throws -> SourceBranchComparison {
        let result: MobileGitBranchCompareResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSourceControlWireContract.branchComparePath,
            input: MobileGitBranchCompareRequestWire(
                worktree: sourceWorktreeID(worktreeID),
                baseRef: baseRef
            ),
            output: MobileGitBranchCompareResultWire.self
        )
        return SourceBranchComparison(
            baseRef: result.summary.baseRef,
            baseOID: result.summary.baseOid,
            headOID: result.summary.headOid,
            mergeBase: result.summary.mergeBase,
            changedFiles: result.summary.changedFiles,
            commitsAhead: result.summary.commitsAhead,
            status: result.summary.status,
            errorMessage: result.summary.errorMessage,
            entries: result.entries.map {
                SourceBranchFile(
                    path: $0.path,
                    status: SourceFileStatus(rawValue: $0.status.rawValue) ?? .modified,
                    oldPath: $0.oldPath,
                    added: $0.added,
                    removed: $0.removed
                )
            }
        )
    }

    func sourceBranchDiff(
        for hostID: String,
        worktreeID: String,
        entry: SourceBranchFile,
        comparison: SourceBranchComparison
    ) async throws -> WorkspaceFileDocument {
        guard let headOID = comparison.headOID, let mergeBase = comparison.mergeBase else {
            throw SourceControlRepositoryError.unavailableBranchDiff
        }
        let wire: MobileGitDiffResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSourceControlWireContract.branchDiffPath,
            input: MobileGitBranchDiffRequestWire(
                worktree: sourceWorktreeID(worktreeID),
                filePath: entry.path,
                compare: MobileGitBranchDiffCompareWire(
                    baseRef: comparison.baseRef,
                    baseOid: comparison.baseOID,
                    headOid: headOID,
                    mergeBase: mergeBase
                ),
                oldPath: entry.oldPath
            ),
            output: MobileGitDiffResultWire.self
        )
        switch wire.kind {
        case .text:
            let diff = WorkspaceDiffBuilder.build(
                originalContent: wire.originalContent,
                modifiedContent: wire.modifiedContent
            )
            return .diff(lines: diff.lines, isTruncated: diff.isTruncated)
        case .binary:
            guard wire.isImage == true else { throw WorkspaceContentError.unsupportedBinary }
            let encoded = wire.modifiedContent.isEmpty ? wire.originalContent : wire.modifiedContent
            guard let data = Data(base64Encoded: encoded) else {
                throw WorkspaceContentError.invalidImage
            }
            return .image(data: data, mimeType: wire.mimeType)
        }
    }

    func generateSourceCommitMessage(for hostID: String, worktreeID: String) async throws -> String
    {
        let result: MobileGitGenerateCommitMessageResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSourceControlWireContract.generateCommitMessagePath,
            input: sourceWorktreeRequest(worktreeID),
            output: MobileGitGenerateCommitMessageResultWire.self
        )
        guard result.success, let message = result.message, !message.isEmpty else {
            throw SourceControlRepositoryError.rejectedGeneration(result.error)
        }
        return message
    }

    func cancelSourceCommitMessage(for hostID: String, worktreeID: String) async throws {
        try await sourceWorktreeMutation(
            hostID,
            worktreeID,
            MobileSourceControlWireContract.cancelGenerateCommitMessagePath
        )
    }

    func sourceHistory(
        for hostID: String,
        worktreeID: String,
        limit: Int
    ) async throws -> [SourceCommit] {
        let result: MobileGitHistoryResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSourceControlWireContract.historyPath,
            input: MobileGitHistoryRequestWire(
                worktree: sourceWorktreeID(worktreeID),
                limit: limit
            ),
            output: MobileGitHistoryResultWire.self
        )
        return result.items.map { item in
            SourceCommit(
                id: item.id,
                parentID: item.parentIds.first,
                displayID: item.displayId ?? String(item.id.prefix(7)),
                subject: item.subject.isEmpty
                    ? String(localized: "(no commit message)") : item.subject,
                author: item.author ?? "",
                timestamp: item.timestamp.map(Date.init(timeIntervalSince1970:))
            )
        }
    }

    func sourceCommitFiles(
        for hostID: String,
        worktreeID: String,
        commitID: String
    ) async throws -> [SourceCommitFile] {
        let result: MobileGitCommitCompareResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSourceControlWireContract.commitComparePath,
            input: MobileGitCommitCompareRequestWire(
                worktree: sourceWorktreeID(worktreeID),
                commitId: commitID
            ),
            output: MobileGitCommitCompareResultWire.self
        )
        guard result.summary.status == "ready" else { return [] }
        return result.entries.map { entry in
            SourceCommitFile(
                path: entry.path,
                status: SourceFileStatus(rawValue: entry.status.rawValue) ?? .modified,
                oldPath: entry.oldPath,
                added: entry.added,
                removed: entry.removed
            )
        }
    }
}
