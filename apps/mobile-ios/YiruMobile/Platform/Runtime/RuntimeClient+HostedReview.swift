import Foundation

extension RuntimeClient: HostedReviewRepository {
    func launchHostedReviewTriage(
        for hostID: String,
        workspaceID: String,
        prompt: String
    ) async throws {
        let snapshot = try await createWorkspaceTerminal(
            for: hostID,
            worktreeID: workspaceID,
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

    func hostedReview(
        for hostID: String,
        workspace: WorkspaceSummary,
        status: SourceStatusSnapshot,
        linkedProvider: HostedReviewProvider?,
        linkedNumber: Int?
    ) async throws -> HostedReview? {
        let wire: MobileHostedReviewInfoWire? = try await callRuntime(
            hostID: hostID,
            path: MobileHostedReviewWireContract.forBranchPath,
            input: MobileHostedReviewForBranchRequestWire(
                repo: hostedReviewRepoSelector(workspace.repoID),
                branch: status.branchLabel,
                currentHeadOid: status.head,
                linkedGitHubPR: linkedProvider == .github
                    ? linkedNumber : workspace.linkedPullRequest?.number,
                linkedGitLabMR: linkedProvider == .gitlab
                    ? linkedNumber : workspace.linkedGitLabMergeRequest
            ),
            output: MobileHostedReviewInfoWire?.self
        )
        return wire.map { mapHostedReview($0) }
    }

    func hostedReviewEligibility(
        for hostID: String,
        workspace: WorkspaceSummary,
        status: SourceStatusSnapshot
    ) async throws -> HostedReviewEligibility {
        let upstream = status.upstream
        let wire: MobileHostedReviewEligibilityWire = try await callRuntime(
            hostID: hostID,
            path: MobileHostedReviewWireContract.eligibilityPath,
            input: MobileHostedReviewEligibilityRequestWire(
                repo: hostedReviewRepoSelector(workspace.repoID),
                worktree: hostedReviewWorktreeSelector(workspace.id),
                branch: status.branchLabel,
                base: nil,
                hasUncommittedChanges: !status.entries.isEmpty,
                hasUpstream: upstream?.hasUpstream,
                ahead: upstream?.ahead,
                behind: upstream?.behind,
                linkedGitHubPR: workspace.linkedPullRequest?.number,
                linkedGitLabMR: workspace.linkedGitLabMergeRequest
            ),
            output: MobileHostedReviewEligibilityWire.self
        )
        return HostedReviewEligibility(
            provider: hostedReviewProvider(wire.provider),
            canCreate: wire.canCreate,
            blockedReason: wire.blockedReason.flatMap {
                HostedReviewBlockedReason(rawValue: $0.rawValue)
            },
            existingReviewURL: wire.review.flatMap { URL(string: $0.url) },
            defaultBaseRef: wire.defaultBaseRef,
            head: wire.head,
            suggestedTitle: wire.title,
            suggestedBody: wire.body
        )
    }

    func createHostedReview(
        for hostID: String,
        workspace: WorkspaceSummary,
        draft: HostedReviewDraft
    ) async throws -> HostedReviewCreation {
        let result: MobileHostedReviewCreateResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileHostedReviewWireContract.createPath,
            input: MobileHostedReviewCreateRequestWire(
                repo: hostedReviewRepoSelector(workspace.repoID),
                worktree: hostedReviewWorktreeSelector(workspace.id),
                provider: hostedReviewProviderWire(draft.provider),
                base: draft.base,
                head: draft.head,
                title: draft.title,
                body: draft.body.isEmpty ? nil : draft.body,
                draft: draft.isDraft,
                useTemplate: draft.useTemplate
            ),
            output: MobileHostedReviewCreateResultWire.self
        )
        if result.ok, let number = result.number {
            return HostedReviewCreation(
                number: number,
                url: result.url.flatMap(URL.init(string:)),
                isExisting: false
            )
        }
        if let existing = result.existingReview {
            return HostedReviewCreation(
                number: existing.number,
                url: URL(string: existing.url),
                isExisting: true
            )
        }
        if result.ok { throw HostedReviewRepositoryError.invalidCreationResult }
        throw HostedReviewRepositoryError.rejected(result.error)
    }

    func setHostedReviewLink(
        for hostID: String,
        workspaceID: String,
        provider: HostedReviewProvider,
        number: Int?,
        baseRef: String?
    ) async throws {
        guard provider != .unsupported else { return }
        let revision = try await workspaceMutationRevision(hostID: hostID, workspaceID: workspaceID)
        let _: MobileWorkspacePinResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.worktreeSetPath,
            input: HostedReviewLinkRequest(
                worktree: hostedReviewWorktreeSelector(workspaceID),
                expectedRevision: revision,
                provider: provider,
                number: number,
                baseRef: baseRef
            ),
            output: MobileWorkspacePinResultWire.self
        )
    }

    func hostedReviewDetails(
        for hostID: String,
        workspace: WorkspaceSummary,
        review: HostedReview
    ) async throws -> HostedReviewDetails? {
        guard review.provider == .github else { return nil }
        let wire: MobileGitHubWorkItemDetailsWire? = try await callRuntime(
            hostID: hostID,
            path: MobileHostedReviewWireContract.detailsPath,
            input: MobileGitHubReviewRequestWire(
                repo: hostedReviewRepoSelector(workspace.repoID),
                number: review.number,
                type: "pr"
            ),
            output: MobileGitHubWorkItemDetailsWire?.self
        )
        let settings: MobileWorkspaceRuntimeSettingsEnvelopeWire? = try? await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.settingsGetPath,
            input: Optional<String>.none,
            output: MobileWorkspaceRuntimeSettingsEnvelopeWire.self
        )
        let botAuthors = hostedReviewBotAuthorSet(
            settings?.settings.prBotAuthorOverrides ?? []
        )
        return wire.map { mapHostedReviewDetails($0, botAuthors: botAuthors) }
    }

    func hostedReviewChecks(
        for hostID: String,
        workspace: WorkspaceSummary,
        review: HostedReview,
        details: HostedReviewDetails?
    ) async throws -> [HostedReviewCheck] {
        guard review.provider == .github else { return [] }
        let wires: [MobileGitHubCheckWire] = try await callRuntime(
            hostID: hostID,
            path: MobileHostedReviewWireContract.checksPath,
            input: MobileGitHubChecksRequestWire(
                repo: hostedReviewRepoSelector(workspace.repoID),
                prNumber: review.number,
                headSha: details?.headSHA ?? review.headSHA,
                prRepo: details?.repoIdentity.map(hostedReviewRepoIdentityWire)
            ),
            output: [MobileGitHubCheckWire].self
        )
        return wires.map(hostedReviewCheck)
    }

    func hostedReviewAssignableUsers(
        for hostID: String,
        workspace: WorkspaceSummary
    ) async throws -> [HostedReviewUser] {
        let wires: [MobileGitHubAssignableUserWire] = try await callRuntime(
            hostID: hostID,
            path: MobileHostedReviewWireContract.assignableUsersPath,
            input: MobileGitHubRepoRequestWire(repo: hostedReviewRepoSelector(workspace.repoID)),
            output: [MobileGitHubAssignableUserWire].self
        )
        return wires.map {
            HostedReviewUser(login: $0.login, name: $0.name, avatarURL: URL(string: $0.avatarUrl))
        }
    }

    func hostedReviewCheckDetails(
        for hostID: String,
        workspace: WorkspaceSummary,
        review: HostedReview,
        details: HostedReviewDetails?,
        check: HostedReviewCheck
    ) async throws -> HostedReviewCheckRunDetails? {
        guard review.provider == .github else { return nil }
        let wire: MobileGitHubCheckRunDetailsWire? = try await callRuntime(
            hostID: hostID,
            path: MobileHostedReviewWireContract.checkDetailsPath,
            input: MobileGitHubCheckDetailsRequestWire(
                repo: hostedReviewRepoSelector(workspace.repoID),
                checkRunId: check.checkRunID,
                workflowRunId: check.workflowRunID,
                checkName: check.name,
                url: check.url?.absoluteString,
                prRepo: details?.repoIdentity.map(hostedReviewRepoIdentityWire)
            ),
            output: MobileGitHubCheckRunDetailsWire?.self
        )
        return wire.map(hostedReviewCheckRunDetails)
    }

}

nonisolated private struct MobileGitHubRepoRequestWire: Encodable, Sendable { let repo: String }

nonisolated private struct HostedReviewLinkRequest: Encodable, Sendable {
    let worktree: String
    let expectedRevision: Int
    let provider: HostedReviewProvider
    let number: Int?
    let baseRef: String?

    enum CodingKeys: String, CodingKey {
        case worktree
        case expectedRevision
        case linkedPR
        case linkedGitLabMR
        case linkedBitbucketPR
        case linkedAzureDevOpsPR
        case linkedGiteaPR
        case baseRef
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(worktree, forKey: .worktree)
        try values.encode(expectedRevision, forKey: .expectedRevision)
        try values.encodeIfPresent(baseRef, forKey: .baseRef)
        switch provider {
        case .github: try values.encode(number, forKey: .linkedPR)
        case .gitlab: try values.encode(number, forKey: .linkedGitLabMR)
        case .bitbucket: try values.encode(number, forKey: .linkedBitbucketPR)
        case .azureDevOps: try values.encode(number, forKey: .linkedAzureDevOpsPR)
        case .gitea: try values.encode(number, forKey: .linkedGiteaPR)
        case .unsupported: break
        }
    }
}
