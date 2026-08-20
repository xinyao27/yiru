import Foundation

extension RuntimeClient: SourceControlRepository {
    func launchSourceControlAgent(
        for hostID: String,
        worktreeID: String,
        prompt: String
    ) async throws {
        let snapshot = try await createWorkspaceTerminal(
            for: hostID,
            worktreeID: worktreeID,
            afterTabID: nil,
            agentID: nil
        )
        guard
            let tab = snapshot.tabs.first(where: { $0.isActive && $0.terminalTarget != nil })
                ?? snapshot.tabs.last(where: { $0.terminalTarget != nil }),
            let terminal = tab.terminalTarget
        else { throw SourceReviewRepositoryError.missingTerminal }
        let result: MobileReviewTerminalSendResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileReviewWireContract.terminalSendPath,
            input: MobileReviewTerminalSendRequestWire(
                terminal: terminal.id,
                text: prompt,
                enter: true
            ),
            output: MobileReviewTerminalSendResultWire.self
        )
        guard result.send.accepted else { throw SourceReviewRepositoryError.terminalRejected }
    }

    func sourceStatus(for hostID: String, worktreeID: String) async throws -> SourceStatusSnapshot {
        let wire: MobileGitStatusResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSourceControlWireContract.statusPath,
            input: sourceWorktreeRequest(worktreeID),
            output: MobileGitStatusResultWire.self
        )
        return SourceStatusSnapshot(
            entries: wire.entries.map(sourceEntry),
            conflictOperation: SourceConflictOperation(rawValue: wire.conflictOperation),
            head: wire.head,
            branch: wire.branch,
            upstream: wire.upstreamStatus.map {
                SourceUpstreamStatus(
                    hasUpstream: $0.hasUpstream,
                    name: $0.upstreamName,
                    ahead: $0.ahead,
                    behind: $0.behind,
                    hasConfiguredPushTarget: $0.hasConfiguredPushTarget == true,
                    behindCommitsArePatchEquivalent: $0.behindCommitsArePatchEquivalent == true
                )
            },
            didHitLimit: wire.didHitLimit == true
        )
    }

    func stageSourceFile(for hostID: String, worktreeID: String, path: String) async throws {
        try await sourceFileMutation(
            hostID, worktreeID, path, MobileSourceControlWireContract.stagePath)
    }

    func unstageSourceFile(for hostID: String, worktreeID: String, path: String) async throws {
        try await sourceFileMutation(
            hostID, worktreeID, path, MobileSourceControlWireContract.unstagePath)
    }

    func discardSourceFile(for hostID: String, worktreeID: String, path: String) async throws {
        try await sourceFileMutation(
            hostID, worktreeID, path, MobileSourceControlWireContract.discardPath)
    }

    func stageSourceFiles(for hostID: String, worktreeID: String, paths: [String]) async throws {
        try await sourceBulkMutation(
            hostID, worktreeID, paths, MobileSourceControlWireContract.bulkStagePath)
    }

    func unstageSourceFiles(for hostID: String, worktreeID: String, paths: [String]) async throws {
        try await sourceBulkMutation(
            hostID, worktreeID, paths, MobileSourceControlWireContract.bulkUnstagePath)
    }

    func commitSourceFiles(
        for hostID: String,
        worktreeID: String,
        message: String
    ) async throws {
        let result: MobileGitCommitResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSourceControlWireContract.commitPath,
            input: MobileGitCommitRequestWire(
                worktree: sourceWorktreeID(worktreeID),
                message: message
            ),
            output: MobileGitCommitResultWire.self
        )
        guard result.success else {
            throw SourceControlRepositoryError.rejectedCommit(result.error)
        }
    }

    func fetchSourceRemote(for hostID: String, worktreeID: String) async throws {
        try await sourceWorktreeMutation(
            hostID, worktreeID, MobileSourceControlWireContract.fetchPath)
    }

    func pullSourceRemote(for hostID: String, worktreeID: String) async throws {
        try await sourceWorktreeMutation(
            hostID, worktreeID, MobileSourceControlWireContract.pullPath)
    }

    func pushSourceRemote(
        for hostID: String,
        worktreeID: String,
        publish: Bool,
        forceWithLease: Bool
    ) async throws {
        let result: MobileGitMutationResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSourceControlWireContract.pushPath,
            input: MobileGitPushRequestWire(
                worktree: sourceWorktreeID(worktreeID),
                publish: publish ? true : nil,
                forceWithLease: forceWithLease ? true : nil
            ),
            output: MobileGitMutationResultWire.self
        )
        guard result.ok else { throw SourceControlRepositoryError.rejectedMutation }
    }

    func fastForwardSourceRemote(for hostID: String, worktreeID: String) async throws {
        try await sourceWorktreeMutation(
            hostID,
            worktreeID,
            MobileSourceControlWireContract.fastForwardPath
        )
    }

    func liveWorktreeDisplayName(for hostID: String, worktreeID: String) async -> String? {
        guard
            let result: MobileWorktreeShowResultWire = try? await callRuntime(
                hostID: hostID,
                path: MobileRuntimeWireContract.worktreeShowPath,
                input: MobileWorktreeShowRequestWire(worktree: sourceWorktreeID(worktreeID)),
                output: MobileWorktreeShowResultWire.self
            ),
            let name = result.worktree.displayName?.trimmingCharacters(in: .whitespacesAndNewlines),
            !name.isEmpty
        else { return nil }
        return name
    }

    func sourceDefaultBaseRef(
        for hostID: String,
        worktreeID: String,
        repoID: String
    ) async throws -> String {
        // Why: a worktree can pin a comparison base that differs from its repository default,
        // so resolve worktree first, then the repo projection, then the default resolver. That
        // order keeps branch review and rebase actions on the same ref.
        if let worktree = try? await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.worktreeShowPath,
            input: MobileWorktreeShowRequestWire(worktree: sourceWorktreeID(worktreeID)),
            output: MobileWorktreeShowResultWire.self
        ), let baseRef = nonEmptyBaseRef(worktree.worktree.baseRef) {
            return baseRef
        }
        if let repos = try? await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.repoListPath,
            input: RuntimeVoidInput(),
            output: MobileRepoListWire.self
        ),
            let baseRef = nonEmptyBaseRef(
                repos.repos.first(where: { $0.id == repoID })?.worktreeBaseRef
            )
        {
            return baseRef
        }
        let result: MobileRepoBaseRefDefaultResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileWorkspaceCreationWireContract.baseRefDefaultPath,
            input: MobileRepoBaseRefDefaultRequestWire(repo: "id:\(repoID)"),
            output: MobileRepoBaseRefDefaultResultWire.self
        )
        guard let baseRef = nonEmptyBaseRef(result.defaultBaseRef) else {
            throw SourceControlRepositoryError.missingBaseRef
        }
        return baseRef
    }

    func rebaseSourceBranch(
        for hostID: String,
        worktreeID: String,
        baseRef: String
    ) async throws {
        let result: MobileGitMutationResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSourceControlWireContract.rebaseFromBasePath,
            input: MobileGitRebaseRequestWire(
                worktree: sourceWorktreeID(worktreeID),
                baseRef: baseRef
            ),
            output: MobileGitMutationResultWire.self
        )
        guard result.ok else { throw SourceControlRepositoryError.rejectedMutation }
    }

    func abortSourceConflict(
        for hostID: String,
        worktreeID: String,
        operation: SourceConflictOperation
    ) async throws {
        let path =
            switch operation {
            case .merge: MobileSourceControlWireContract.abortMergePath
            case .rebase: MobileSourceControlWireContract.abortRebasePath
            case .revert: MobileSourceControlWireContract.abortRevertPath
            }
        try await sourceWorktreeMutation(hostID, worktreeID, path)
    }

    func sourceLocalBranches(
        for hostID: String,
        worktreeID: String
    ) async throws -> SourceLocalBranches {
        let result: MobileGitLocalBranchesResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSourceControlWireContract.localBranchesPath,
            input: sourceWorktreeRequest(worktreeID),
            output: MobileGitLocalBranchesResultWire.self
        )
        return SourceLocalBranches(current: result.current, branches: result.branches)
    }

    func checkoutSourceBranch(
        for hostID: String,
        worktreeID: String,
        branch: String
    ) async throws {
        let result: MobileGitCheckoutResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileSourceControlWireContract.checkoutPath,
            input: MobileGitCheckoutRequestWire(
                worktree: sourceWorktreeID(worktreeID),
                branch: branch
            ),
            output: MobileGitCheckoutResultWire.self
        )
        guard result.ok else { throw SourceControlRepositoryError.rejectedMutation }
    }
}

nonisolated private func nonEmptyBaseRef(_ value: String?) -> String? {
    let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return trimmed.isEmpty ? nil : trimmed
}
