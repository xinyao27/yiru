import Foundation

extension RuntimeClient {
    func mutateHostedReview(
        for hostID: String,
        workspace: WorkspaceSummary,
        review: HostedReview,
        details: HostedReviewDetails?,
        mutation: HostedReviewMutation
    ) async throws {
        guard review.provider == .github else {
            throw HostedReviewRepositoryError.unsupportedMutation
        }
        let repo = hostedReviewRepoSelector(workspace.repoID)
        let identity = details?.repoIdentity.map(hostedReviewRepoIdentityWire)
        switch mutation {
        case .update(let title, let body):
            try await requireHostedReviewMutation(
                hostID: hostID,
                path: MobileHostedReviewWireContract.updatePath,
                input: MobileGitHubUpdateRequestWire(
                    repo: repo,
                    prNumber: review.number,
                    updates: MobileGitHubPRUpdatesWire(title: title, body: body),
                    prRepo: identity
                )
            )
        case .merge(let method):
            try await requireHostedReviewMutation(
                hostID: hostID,
                path: MobileHostedReviewWireContract.mergePath,
                input: MobileGitHubMergeRequestWire(
                    repo: repo,
                    prNumber: review.number,
                    method: method,
                    prRepo: identity
                )
            )
        case .setAutoMerge(let enabled, let method):
            try await requireHostedReviewMutation(
                hostID: hostID,
                path: MobileHostedReviewWireContract.autoMergePath,
                input: MobileGitHubAutoMergeRequestWire(
                    repo: repo,
                    prNumber: review.number,
                    method: method,
                    prRepo: identity,
                    enabled: enabled
                )
            )
        case .updateState(let state):
            try await requireHostedReviewMutation(
                hostID: hostID,
                path: MobileHostedReviewWireContract.updateStatePath,
                input: MobileGitHubStateRequestWire(
                    repo: repo,
                    prNumber: review.number,
                    updates: MobileGitHubStateUpdatesWire(state: state.rawValue)
                )
            )
        case .requestReviewer(let login):
            try await requireHostedReviewMutation(
                hostID: hostID,
                path: MobileHostedReviewWireContract.requestReviewersPath,
                input: MobileGitHubReviewersRequestWire(
                    repo: repo,
                    prNumber: review.number,
                    reviewers: [login]
                )
            )
        case .removeReviewer(let login):
            try await requireHostedReviewMutation(
                hostID: hostID,
                path: MobileHostedReviewWireContract.removeReviewersPath,
                input: MobileGitHubReviewersRequestWire(
                    repo: repo,
                    prNumber: review.number,
                    reviewers: [login]
                )
            )
        case .addComment(let body):
            let result: MobileGitHubCommentResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileHostedReviewWireContract.addCommentPath,
                input: MobileGitHubCommentRequestWire(
                    repo: repo,
                    number: review.number,
                    body: body,
                    prRepo: identity
                ),
                output: MobileGitHubCommentResultWire.self
            )
            guard result.ok else { throw HostedReviewRepositoryError.rejected(result.error) }
        case .reply(let comment, let body):
            let result: MobileGitHubCommentResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileHostedReviewWireContract.replyCommentPath,
                input: MobileGitHubReplyCommentRequestWire(
                    repo: repo,
                    prNumber: review.number,
                    commentId: comment.id,
                    body: body,
                    threadId: comment.threadID,
                    path: comment.path,
                    line: comment.line,
                    prRepo: identity
                ),
                output: MobileGitHubCommentResultWire.self
            )
            guard result.ok else { throw HostedReviewRepositoryError.rejected(result.error) }
        case .rerunFailedChecks:
            let result: MobileGitHubRerunResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileHostedReviewWireContract.rerunChecksPath,
                input: MobileGitHubRerunChecksRequestWire(
                    repo: repo,
                    prNumber: review.number,
                    headSha: details?.headSHA ?? review.headSHA,
                    prRepo: identity,
                    failedOnly: true
                ),
                output: MobileGitHubRerunResultWire.self
            )
            guard result.ok else { throw HostedReviewRepositoryError.rejected(result.error) }
        case .resolveThread(let id, let resolve):
            let accepted: Bool = try await callRuntime(
                hostID: hostID,
                path: MobileHostedReviewWireContract.resolveThreadPath,
                input: MobileGitHubResolveThreadRequestWire(
                    repo: repo,
                    threadId: id,
                    resolve: resolve
                ),
                output: Bool.self
            )
            guard accepted else { throw HostedReviewRepositoryError.rejected(nil) }
        }
    }

    private func requireHostedReviewMutation<Input: Encodable & Sendable>(
        hostID: String,
        path: String,
        input: Input
    ) async throws {
        let result: MobileGitHubMutationResultWire = try await callRuntime(
            hostID: hostID,
            path: path,
            input: input,
            output: MobileGitHubMutationResultWire.self
        )
        guard result.ok else { throw HostedReviewRepositoryError.rejected(result.error) }
    }
}
