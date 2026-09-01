import Foundation

extension RuntimeClient: SourceReviewRepository {
    func sourceReviewMetadata(for hostID: String, worktreeID: String) async throws
        -> SourceReviewMetadata
    {
        let result: MobileReviewMetadataResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileReviewWireContract.metadataGetPath,
            input: MobileReviewMetadataRequestWire(worktree: reviewWorktree(worktreeID)),
            output: MobileReviewMetadataResultWire.self
        )
        return SourceReviewMetadata(
            comments: (result.worktree.diffComments ?? []).map(sourceReviewComment),
            state: result.worktree.mobileDiffReview.map(sourceReviewState) ?? .empty
        )
    }

    func saveSourceReviewMetadata(
        for hostID: String,
        worktreeID: String,
        comments: [SourceReviewComment],
        state: SourceReviewState
    ) async throws {
        let _: MobileReviewMetadataResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileReviewWireContract.metadataSetPath,
            input: MobileReviewMetadataSetRequestWire(
                worktree: reviewWorktree(worktreeID),
                diffComments: comments.map(sourceReviewCommentWire),
                mobileDiffReview: sourceReviewStateWire(state)
            ),
            output: MobileReviewMetadataResultWire.self
        )
    }

    func sourceReviewDiff(
        for hostID: String,
        worktreeID: String,
        item: SourceReviewItem,
        branchComparison: SourceBranchComparison?
    ) async throws -> SourceReviewDiff {
        if item.scope == .branch {
            guard let branchComparison else {
                throw SourceReviewRepositoryError.missingBranchComparison
            }
            let document = try await sourceBranchDiff(
                for: hostID,
                worktreeID: worktreeID,
                entry: SourceBranchFile(
                    path: item.filePath,
                    status: item.status,
                    oldPath: item.oldPath,
                    added: item.added,
                    removed: item.removed
                ),
                comparison: branchComparison
            )
            return .document(document)
        }
        do {
            let result: MobileGitDiffResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileSessionTabsWireContract.gitDiffPath,
                input: MobileGitDiffRequestWire(
                    worktree: reviewWorktree(worktreeID),
                    filePath: item.filePath,
                    staged: item.scope == .staged,
                    compareAgainstHead: nil
                ),
                output: MobileGitDiffResultWire.self
            )
            switch result.kind {
            case .text:
                break
            case .binary:
                return .binary
            }
            let diff = WorkspaceDiffBuilder.build(
                originalContent: result.originalContent,
                modifiedContent: result.modifiedContent
            )
            return .document(.diff(lines: diff.lines, isTruncated: diff.isTruncated))
        } catch {
            if item.status == .deleted { return .deleted }
            throw error
        }
    }

    func sourceReviewTerminals(for hostID: String, worktreeID: String) async throws
        -> [SourceReviewTerminal]
    {
        let snapshot = try await workspaceTabs(for: hostID, worktreeID: worktreeID)
        return snapshot.tabs.compactMap { tab in
            guard let target = tab.terminalTarget, target.isWritable else { return nil }
            return SourceReviewTerminal(id: target.id, title: tab.displayTitle)
        }
    }

    func createSourceReviewTerminal(for hostID: String, worktreeID: String) async throws
        -> SourceReviewTerminal
    {
        let snapshot = try await createWorkspaceTerminal(
            for: hostID,
            worktreeID: worktreeID,
            afterTabID: nil,
            agentID: nil
        )
        guard
            let tab = snapshot.tabs.first(where: { $0.isActive && $0.terminalTarget != nil })
                ?? snapshot.tabs.last(where: { $0.terminalTarget != nil }),
            let target = tab.terminalTarget
        else { throw SourceReviewRepositoryError.missingTerminal }
        return SourceReviewTerminal(id: target.id, title: tab.displayTitle)
    }

    func sendSourceReviewNotes(
        for hostID: String,
        terminalID: String,
        comments: [SourceReviewComment]
    ) async throws {
        let result: MobileReviewTerminalSendResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileReviewWireContract.terminalSendPath,
            input: MobileReviewTerminalSendRequestWire(
                terminal: terminalID,
                text: sourceReviewPrompt(comments),
                enter: true
            ),
            output: MobileReviewTerminalSendResultWire.self
        )
        guard result.send.accepted else { throw SourceReviewRepositoryError.terminalRejected }
    }

    func openSourceReviewInSession(
        for hostID: String,
        worktreeID: String,
        item: SourceReviewItem
    ) async throws {
        guard item.scope != .branch else { return }
        do {
            let _: MobileFileOpenResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileReviewWireContract.fileOpenDiffPath,
                input: MobileReviewFileOpenDiffRequestWire(
                    worktree: reviewWorktree(worktreeID),
                    relativePath: item.filePath,
                    staged: item.scope == .staged
                ),
                output: MobileFileOpenResultWire.self
            )
        } catch let error as RuntimeOrpcError where isOpenDiffUnavailable(error) {
            // Why: older Desktop runtimes do not expose files.openDiff. Fall back to the
            // regular tab path so the session flow is preserved instead of ejecting the user
            // into the standalone review route.
            let _: MobileFileOpenResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileSessionTabsWireContract.fileOpenPath,
                input: MobileFileReadRequestWire(
                    worktree: reviewWorktree(worktreeID),
                    relativePath: item.filePath
                ),
                output: MobileFileOpenResultWire.self
            )
        }
    }
}

nonisolated private func reviewWorktree(_ id: String) -> String { "id:\(id)" }

nonisolated private func isOpenDiffUnavailable(_ error: RuntimeOrpcError) -> Bool {
    error.serverCode == "forbidden"
        || error.serverCode == "method_not_found"
        || error.serverMessage?.localizedCaseInsensitiveContains("not available to mobile") == true
}

nonisolated private func sourceReviewComment(_ wire: MobileReviewCommentWire)
    -> SourceReviewComment
{
    SourceReviewComment(
        id: wire.id,
        worktreeID: wire.worktreeId,
        filePath: wire.filePath,
        source: wire.source,
        selectedText: wire.selectedText,
        startLine: wire.startLine,
        lineNumber: wire.lineNumber,
        body: wire.body,
        createdAt: wire.createdAt,
        updatedAt: wire.updatedAt,
        sentAt: wire.sentAt,
        scope: wire.scope.flatMap { SourceReviewScope(rawValue: $0.rawValue) },
        oldPath: wire.oldPath,
        diffIdentity: wire.diffIdentity
    )
}

nonisolated private func sourceReviewCommentWire(_ value: SourceReviewComment)
    -> MobileReviewCommentWire
{
    MobileReviewCommentWire(
        id: value.id,
        worktreeId: value.worktreeID,
        filePath: value.filePath,
        source: value.source,
        selectedText: value.selectedText,
        startLine: value.startLine,
        lineNumber: value.lineNumber,
        body: value.body,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        sentAt: value.sentAt,
        scope: value.scope.flatMap { MobileReviewScopeWire(rawValue: $0.rawValue) },
        oldPath: value.oldPath,
        diffIdentity: value.diffIdentity,
        side: "modified"
    )
}

nonisolated private func sourceReviewState(_ wire: MobileReviewStateWire) -> SourceReviewState {
    SourceReviewState(
        updatedAt: wire.updatedAt,
        completedAt: wire.completedAt,
        files: wire.files.mapValues {
            SourceReviewFileState(
                key: $0.key,
                filePath: $0.filePath,
                oldPath: $0.oldPath,
                scope: SourceReviewScope(rawValue: $0.scope.rawValue) ?? .unstaged,
                lastOpenedAt: $0.lastOpenedAt,
                lastSeenDiffIdentity: $0.lastSeenDiffIdentity,
                reviewedAt: $0.reviewedAt,
                reviewDiffIdentity: $0.reviewDiffIdentity
            )
        }
    )
}

nonisolated private func sourceReviewStateWire(_ state: SourceReviewState)
    -> MobileReviewStateWire
{
    MobileReviewStateWire(
        version: 1,
        updatedAt: state.updatedAt,
        completedAt: state.completedAt,
        files: state.files.mapValues {
            MobileReviewFileStateWire(
                key: $0.key,
                filePath: $0.filePath,
                oldPath: $0.oldPath,
                scope: MobileReviewScopeWire(rawValue: $0.scope.rawValue) ?? .unstaged,
                lastOpenedAt: $0.lastOpenedAt,
                lastSeenDiffIdentity: $0.lastSeenDiffIdentity,
                reviewedAt: $0.reviewedAt,
                reviewDiffIdentity: $0.reviewDiffIdentity
            )
        }
    )
}

nonisolated private func sourceReviewPrompt(_ comments: [SourceReviewComment]) -> String {
    let notes = formatSourceReviewComments(comments)
    return """
        You are reviewing the current worktree. Address the following mobile review notes.

        \(notes)

        After applying fixes:
        1. Summarize changed files.
        2. Run relevant tests.
        3. Tell me if anything remains risky.
        """
}
