import Foundation

nonisolated func hostedReviewRepoSelector(_ repoID: String) -> String {
    "id:\(repoID)"
}

nonisolated func hostedReviewWorktreeSelector(_ worktreeID: String) -> String {
    "id:\(worktreeID)"
}

nonisolated func hostedReviewProvider(_ wire: MobileHostedReviewProviderWire)
    -> HostedReviewProvider
{
    HostedReviewProvider(rawValue: wire.rawValue) ?? .unsupported
}

nonisolated func hostedReviewProviderWire(_ provider: HostedReviewProvider)
    -> MobileHostedReviewProviderWire
{
    MobileHostedReviewProviderWire(rawValue: provider.rawValue) ?? .unsupported
}

nonisolated func mapHostedReview(_ wire: MobileHostedReviewInfoWire) -> HostedReview {
    HostedReview(
        provider: hostedReviewProvider(wire.provider),
        number: wire.number,
        title: wire.title,
        state: HostedReviewState(rawValue: wire.state.rawValue) ?? .open,
        url: URL(string: wire.url),
        checksStatus: HostedReviewCheckStatus(rawValue: wire.status.rawValue) ?? .neutral,
        mergeable: HostedReviewMergeable(rawValue: wire.mergeable.rawValue) ?? .unknown,
        reviewDecision: wire.reviewDecision.flatMap {
            HostedReviewDecision(rawValue: $0.rawValue)
        },
        autoMergeEnabled: wire.autoMergeEnabled == true,
        autoMergeAllowed: wire.autoMergeAllowed,
        mergeQueueRequired: wire.mergeQueueRequired,
        mergeMethodSettings: wire.mergeMethodSettings.map {
            HostedReviewMergeMethodSettings(
                defaultMethod: $0.defaultMethod,
                allowedMethods: $0.allowedMethods
            )
        },
        mergeStateStatus: wire.mergeStateStatus,
        headSHA: wire.headSha,
        baseRefName: wire.baseRefName,
        conflict: wire.conflictSummary.map {
            HostedReviewConflict(
                baseRef: $0.baseRef,
                baseCommit: $0.baseCommit,
                commitsBehind: $0.commitsBehind,
                files: $0.files,
                localMergeState: $0.localMergeState
            )
        }
    )
}

nonisolated func mapHostedReviewDetails(
    _ wire: MobileGitHubWorkItemDetailsWire,
    botAuthors: Set<String>
)
    -> HostedReviewDetails
{
    let requested = Dictionary(
        uniqueKeysWithValues: (wire.item.reviewRequests ?? []).map {
            ($0.login.lowercased(), $0)
        })
    let reviewed = Dictionary(
        uniqueKeysWithValues: (wire.item.latestReviews ?? []).map {
            ($0.login.lowercased(), $0)
        })
    let identities = Set(requested.keys).union(reviewed.keys)
    let reviewers = identities.sorted().map { key -> HostedReviewReviewer in
        let user = requested[key]
        let review = reviewed[key]
        return HostedReviewReviewer(
            login: user?.login ?? review?.login ?? key,
            name: user?.name,
            avatarURL: URL(string: user?.avatarUrl ?? review?.avatarUrl ?? ""),
            status: hostedReviewStatus(requested: user != nil, state: review?.state)
        )
    }
    return HostedReviewDetails(
        title: wire.item.title,
        author: wire.item.author,
        branchName: wire.item.branchName,
        baseRefName: wire.item.baseRefName,
        body: wire.body,
        comments: wire.comments.map { hostedReviewComment($0, botAuthors: botAuthors) },
        checks: (wire.checks ?? []).map(hostedReviewCheck),
        files: (wire.files ?? []).map {
            HostedReviewFile(
                path: $0.path,
                oldPath: $0.oldPath,
                status: $0.status,
                additions: $0.additions,
                deletions: $0.deletions,
                isBinary: $0.isBinary
            )
        },
        reviewers: reviewers,
        repoIdentity: wire.item.prRepo.map {
            HostedReviewRepoIdentity(owner: $0.owner, repo: $0.repo)
        },
        headSHA: wire.headSha ?? wire.item.headSha
    )
}

nonisolated func hostedReviewStatus(requested: Bool, state: String?) -> String {
    switch state {
    case "APPROVED": String(localized: "Approved")
    case "CHANGES_REQUESTED": String(localized: "Changes requested")
    case "COMMENTED": String(localized: "Commented")
    case "DISMISSED": String(localized: "Dismissed")
    case "PENDING": String(localized: "Pending")
    default: requested ? String(localized: "Requested") : String(localized: "Reviewed")
    }
}

nonisolated func hostedReviewComment(
    _ wire: MobileGitHubCommentWire,
    botAuthors: Set<String>
)
    -> HostedReviewComment
{
    HostedReviewComment(
        id: wire.id,
        author: wire.author,
        authorAvatarURL: URL(string: wire.authorAvatarUrl),
        body: wire.body,
        createdAt: ISODateParser.date(wire.createdAt),
        url: URL(string: wire.url),
        reactions: (wire.reactions ?? []).map {
            HostedReviewReaction(content: $0.content, count: $0.count)
        },
        path: wire.path,
        threadID: wire.threadId,
        isResolved: wire.isResolved == true,
        isOutdated: wire.isOutdated == true,
        line: wire.line,
        startLine: wire.startLine,
        isBot: wire.isBot == true || isHostedReviewBotAuthor(wire.author, overrides: botAuthors)
    )
}

nonisolated func hostedReviewBotAuthorSet(_ values: [String]) -> Set<String> {
    Set(
        values.prefix(500).compactMap { value in
            let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return normalized.isEmpty || normalized.count > 255 ? nil : normalized
        })
}

nonisolated func isHostedReviewBotAuthor(
    _ author: String,
    overrides: Set<String>
) -> Bool {
    let normalized = author.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !normalized.isEmpty, normalized.count <= 255 else { return false }
    if overrides.contains(normalized) || normalized.hasSuffix("[bot]") { return true }
    let automationFragments = [
        "chatgpt-codex-connector", "codex-connector", "qodo", "coderabbit", "codium",
        "sonarcloud", "sonarqube", "sourcery-ai", "deepsource", "snyk", "codecov",
        "greptile", "ellipsis", "graphite-app", "reviewer-gpt", "-reviewer", "automation",
        "actions", "renovate", "dependabot",
    ]
    if automationFragments.contains(where: normalized.contains) { return true }
    if normalized.hasSuffix("bot") { return true }
    return normalized.range(of: #"\bbot\b"#, options: .regularExpression) != nil
}

nonisolated func hostedReviewCheck(_ wire: MobileGitHubCheckWire) -> HostedReviewCheck {
    HostedReviewCheck(
        name: wire.name,
        status: HostedReviewCheckRunStatus(rawValue: wire.status.rawValue) ?? .queued,
        conclusion: wire.conclusion?.rawValue,
        url: wire.url.flatMap(URL.init(string:)),
        checkRunID: wire.checkRunId,
        workflowRunID: wire.workflowRunId
    )
}

nonisolated func hostedReviewCheckRunDetails(_ wire: MobileGitHubCheckRunDetailsWire)
    -> HostedReviewCheckRunDetails
{
    HostedReviewCheckRunDetails(
        name: wire.name,
        status: wire.status,
        conclusion: wire.conclusion,
        url: wire.url.flatMap(URL.init(string:)),
        detailsURL: wire.detailsUrl.flatMap(URL.init(string:)),
        title: wire.title,
        summary: wire.summary,
        text: wire.text,
        annotations: wire.annotations.map {
            HostedReviewCheckAnnotation(
                path: $0.path,
                startLine: $0.startLine,
                endLine: $0.endLine,
                level: $0.annotationLevel,
                title: $0.title,
                message: $0.message,
                rawDetails: $0.rawDetails
            )
        },
        jobs: wire.jobs.map {
            HostedReviewCheckJob(
                id: $0.id,
                name: $0.name,
                status: $0.status,
                conclusion: $0.conclusion,
                url: $0.url.flatMap(URL.init(string:)),
                logTail: $0.logTail,
                steps: $0.steps.map {
                    HostedReviewCheckStep(
                        name: $0.name,
                        status: $0.status,
                        conclusion: $0.conclusion
                    )
                }
            )
        }
    )
}

nonisolated func hostedReviewRepoIdentityWire(_ identity: HostedReviewRepoIdentity)
    -> MobileGitHubRepoIdentityWire
{
    MobileGitHubRepoIdentityWire(owner: identity.owner, repo: identity.repo)
}
