#if DEBUG
    import SwiftUI

    struct SourceControlFixtureView: View {
        private let repository = SourceControlFixtureRepository()
        var showHostedReview = false
        var showCommitHistory = false

        var body: some View {
            NavigationStack {
                SourceControlView(
                    host: HostProfile(
                        id: "fixture-host",
                        name: "Mac Studio",
                        endpoint: "wss://fixture.invalid",
                        publicKeyBase64: "fixture",
                        lastConnected: Date()
                    ),
                    workspace: WorkspaceSummary(
                        sourceFixtureID: "liquid-glass",
                        repoID: "yiru",
                        repoName: "Yiru",
                        branch: "feat/liquid-glass",
                        name: "liquid-glass",
                        comment: "Native SwiftUI rewrite",
                        isPinned: false,
                        lastActivity: Date(),
                        activity: .active
                    ),
                    repository: repository,
                    hostedReviewRepository: repository,
                    connectionRuntime: repository,
                    initialTab: initialTab,
                    openReview: { _ in }
                )
            }
        }

        private var initialTab: SourceControlHubTab {
            if showHostedReview { return .pullRequest }
            if showCommitHistory { return .history }
            return .changes
        }
    }

    nonisolated struct SourceControlFixtureRepository: SourceControlRepository,
        HostedReviewRepository, HostConnectionRuntime
    {
        func connectionSnapshots(forHostIDs hostIDs: [String]) async -> AsyncStream<
            [String: RuntimeConnectionSnapshot]
        > {
            AsyncStream { continuation in
                continuation.yield(
                    Dictionary(
                        uniqueKeysWithValues: hostIDs.map { hostID in
                            (
                                hostID,
                                RuntimeConnectionSnapshot(
                                    hostID: hostID,
                                    hostName: "Fixture",
                                    phase: .connected,
                                    reconnectAttempt: 0,
                                    lastConnectedAt: Date()
                                )
                            )
                        }))
                continuation.finish()
            }
        }

        func reconnect(hostID _: String) async {}
        func disconnect(hostID _: String) async {}

        func sourceStatus(for _: String, worktreeID _: String) async throws
            -> SourceStatusSnapshot
        {
            SourceStatusSnapshot(
                entries: [
                    entry(
                        "apps/mobile-ios/YiruMobile/DesignSystem/Foundations/Theme.swift",
                        .modified,
                        .unstaged,
                        added: 18,
                        removed: 4
                    ),
                    entry(
                        "apps/mobile-ios/YiruMobile/Features/Workspace/WorkspaceListView.swift",
                        .modified,
                        .unstaged,
                        added: 22,
                        removed: 8
                    ),
                    entry(
                        ".github/workflows/mobile-android-release.yml",
                        .modified,
                        .unstaged,
                        added: 1,
                        removed: 1
                    ),
                    entry(
                        "apps/mobile-ios/YiruMobile/Features/SourceControl/SourceView.swift",
                        .untracked,
                        .untracked,
                        added: 284
                    ),
                    entry(
                        "packages/runtime-protocol/src/mobile-wire/source-control-wire.ts",
                        .added,
                        .staged,
                        added: 94
                    ),
                    entry(
                        "scripts/mobile-ios-wire/source-control-wire.mjs",
                        .added,
                        .staged,
                        added: 176
                    ),
                ],
                conflictOperation: nil,
                head: "de7b1a4",
                branch: "refs/heads/feat/liquid-glass",
                upstream: SourceUpstreamStatus(
                    hasUpstream: true,
                    name: "origin/feat/liquid-glass",
                    ahead: 2,
                    behind: 1,
                    hasConfiguredPushTarget: true,
                    behindCommitsArePatchEquivalent: false
                ),
                didHitLimit: false
            )
        }

        func stageSourceFile(for _: String, worktreeID _: String, path _: String) async throws {}
        func unstageSourceFile(for _: String, worktreeID _: String, path _: String) async throws {}
        func discardSourceFile(for _: String, worktreeID _: String, path _: String) async throws {}
        func stageSourceFiles(for _: String, worktreeID _: String, paths _: [String]) async throws {
        }
        func unstageSourceFiles(
            for _: String,
            worktreeID _: String,
            paths _: [String]
        ) async throws {}
        func commitSourceFiles(
            for _: String,
            worktreeID _: String,
            message _: String
        ) async throws {}
        func fetchSourceRemote(for _: String, worktreeID _: String) async throws {}
        func pullSourceRemote(for _: String, worktreeID _: String) async throws {}
        func pushSourceRemote(
            for _: String,
            worktreeID _: String,
            publish _: Bool,
            forceWithLease _: Bool
        ) async throws {}
        func fastForwardSourceRemote(for _: String, worktreeID _: String) async throws {}
        func sourceDefaultBaseRef(
            for _: String,
            worktreeID _: String,
            repoID _: String
        ) async throws -> String { "main" }
        func rebaseSourceBranch(
            for _: String,
            worktreeID _: String,
            baseRef _: String
        ) async throws {}
        func abortSourceConflict(
            for _: String,
            worktreeID _: String,
            operation _: SourceConflictOperation
        ) async throws {}
        func sourceLocalBranches(for _: String, worktreeID _: String) async throws
            -> SourceLocalBranches
        {
            SourceLocalBranches(
                current: "feat/liquid-glass",
                branches: ["feat/liquid-glass", "main", "release/next"]
            )
        }
        func checkoutSourceBranch(
            for _: String,
            worktreeID _: String,
            branch _: String
        ) async throws {}
        func sourceBranchCompare(
            for _: String,
            worktreeID _: String,
            baseRef: String
        ) async throws -> SourceBranchComparison {
            SourceBranchComparison(
                baseRef: baseRef,
                baseOID: String(repeating: "1", count: 40),
                headOID: String(repeating: "2", count: 40),
                mergeBase: String(repeating: "1", count: 40),
                changedFiles: 2,
                commitsAhead: 2,
                status: "ready",
                errorMessage: nil,
                entries: [
                    SourceBranchFile(
                        path: "apps/mobile-ios/YiruMobile/App/AppView.swift",
                        status: .modified,
                        oldPath: nil,
                        added: 22,
                        removed: 8
                    ),
                    SourceBranchFile(
                        path: "apps/mobile-ios/README.md",
                        status: .added,
                        oldPath: nil,
                        added: 48,
                        removed: nil
                    ),
                ]
            )
        }
        func sourceBranchDiff(
            for _: String,
            worktreeID _: String,
            entry _: SourceBranchFile,
            comparison _: SourceBranchComparison
        ) async throws -> WorkspaceFileDocument {
            .diff(lines: [], isTruncated: false)
        }
        func generateSourceCommitMessage(for _: String, worktreeID _: String) async throws
            -> String
        {
            "feat(ios): migrate source control parity"
        }
        func cancelSourceCommitMessage(for _: String, worktreeID _: String) async throws {}
        func launchSourceControlAgent(
            for _: String,
            worktreeID _: String,
            prompt _: String
        ) async throws {}
        func sourceHistory(for _: String, worktreeID _: String, limit _: Int) async throws
            -> [SourceCommit]
        {
            [
                SourceCommit(
                    id: "de7b1a4f93b2",
                    parentID: "9a17c241e125",
                    displayID: "de7b1a4",
                    subject: "feat(ios): complete native mobile parity",
                    author: "Xinyao",
                    timestamp: Date().addingTimeInterval(-7 * 60)
                ),
                SourceCommit(
                    id: "9a17c241e125",
                    parentID: "74ca91ff63aa",
                    displayID: "9a17c24",
                    subject: "refactor(ios): align workspace list details",
                    author: "Xinyao",
                    timestamp: Date().addingTimeInterval(-3 * 60 * 60)
                ),
                SourceCommit(
                    id: "74ca91ff63aa",
                    parentID: nil,
                    displayID: "74ca91f",
                    subject: "docs(ios): define Liquid Glass component contexts",
                    author: "Yiru",
                    timestamp: Date().addingTimeInterval(-2 * 24 * 60 * 60)
                ),
            ]
        }
        func sourceCommitFiles(for _: String, worktreeID _: String, commitID: String) async throws
            -> [SourceCommitFile]
        {
            if commitID == "de7b1a4f93b2" {
                return [
                    SourceCommitFile(
                        path: "apps/mobile-ios/YiruMobile/App/AppView.swift",
                        status: .modified,
                        oldPath: nil,
                        added: 42,
                        removed: 8
                    ),
                    SourceCommitFile(
                        path: "apps/mobile-ios/RELEASE.md",
                        status: .added,
                        oldPath: nil,
                        added: 184,
                        removed: 0
                    ),
                ]
            }
            return []
        }
        func liveWorktreeDisplayName(for _: String, worktreeID _: String) async -> String? { nil }

        func hostedReview(
            for _: String,
            workspace _: WorkspaceSummary,
            status _: SourceStatusSnapshot,
            linkedProvider _: HostedReviewProvider?,
            linkedNumber _: Int?
        ) async throws -> HostedReview? {
            HostedReview(
                provider: .github,
                number: 8421,
                title: "Adopt the native iOS 26 Liquid Glass design system",
                state: .open,
                url: URL(string: "https://github.com/xinyao27/yiru/pull/8421"),
                checksStatus: .failure,
                mergeable: .mergeable,
                reviewDecision: .reviewRequired,
                autoMergeEnabled: false,
                autoMergeAllowed: true,
                mergeQueueRequired: false,
                mergeMethodSettings: HostedReviewMergeMethodSettings(
                    defaultMethod: "squash",
                    allowedMethods: ["merge": true, "squash": true, "rebase": true]
                ),
                mergeStateStatus: "BLOCKED",
                headSHA: "de7b1a4",
                baseRefName: "main",
                conflict: nil
            )
        }

        func hostedReviewEligibility(
            for _: String,
            workspace _: WorkspaceSummary,
            status _: SourceStatusSnapshot
        ) async throws -> HostedReviewEligibility {
            HostedReviewEligibility(
                provider: .github,
                canCreate: true,
                blockedReason: nil,
                existingReviewURL: nil,
                defaultBaseRef: "main",
                head: "feat/liquid-glass",
                suggestedTitle: "Adopt Liquid Glass",
                suggestedBody: nil
            )
        }

        func createHostedReview(
            for _: String,
            workspace _: WorkspaceSummary,
            draft _: HostedReviewDraft
        ) async throws -> HostedReviewCreation {
            HostedReviewCreation(number: 8421, url: nil, isExisting: false)
        }

        func setHostedReviewLink(
            for _: String,
            workspaceID _: String,
            provider _: HostedReviewProvider,
            number _: Int?,
            baseRef _: String?
        ) async throws {}

        func hostedReviewDetails(
            for _: String,
            workspace _: WorkspaceSummary,
            review _: HostedReview
        ) async throws -> HostedReviewDetails? {
            HostedReviewDetails(
                title: "Adopt the native iOS 26 Liquid Glass design system",
                author: "xinyao27",
                branchName: "feat/liquid-glass",
                baseRefName: "main",
                body:
                    "Rebuilds the mobile companion in **SwiftUI** while preserving the existing product behavior and visual details.",
                comments: [
                    HostedReviewComment(
                        id: 1,
                        author: "reviewer",
                        authorAvatarURL: nil,
                        body:
                            "The workspace list spacing now matches the current mobile client. Please keep the loader neutral gray.",
                        createdAt: Date().addingTimeInterval(-3_600),
                        url: URL(
                            string: "https://github.com/xinyao27/yiru/pull/8421#issuecomment-1"),
                        reactions: [HostedReviewReaction(content: "+1", count: 2)],
                        path: nil,
                        threadID: nil,
                        isResolved: false,
                        isOutdated: false,
                        line: nil,
                        startLine: nil,
                        isBot: false
                    ),
                    HostedReviewComment(
                        id: 2,
                        author: "reviewer",
                        authorAvatarURL: nil,
                        body: "Could the workspace rail keep its 32pt start inset?",
                        createdAt: Date().addingTimeInterval(-3_000),
                        url: nil,
                        reactions: [],
                        path: "WorkspaceListView.swift",
                        threadID: "workspace-rail",
                        isResolved: false,
                        isOutdated: false,
                        line: 42,
                        startLine: nil,
                        isBot: false
                    ),
                    HostedReviewComment(
                        id: 3,
                        author: "xinyao27",
                        authorAvatarURL: nil,
                        body: "Yes, the rail remains independent from the project icon column.",
                        createdAt: Date().addingTimeInterval(-2_700),
                        url: nil,
                        reactions: [],
                        path: "WorkspaceListView.swift",
                        threadID: "workspace-rail",
                        isResolved: false,
                        isOutdated: false,
                        line: 42,
                        startLine: nil,
                        isBot: false
                    ),
                    HostedReviewComment(
                        id: 4,
                        author: "dependabot[bot]",
                        authorAvatarURL: nil,
                        body: "Dependency metadata is up to date.",
                        createdAt: Date().addingTimeInterval(-2_400),
                        url: nil,
                        reactions: [],
                        path: nil,
                        threadID: "dependency-note",
                        isResolved: true,
                        isOutdated: false,
                        line: nil,
                        startLine: nil,
                        isBot: true
                    ),
                    HostedReviewComment(
                        id: 5,
                        author: "xinyao27",
                        authorAvatarURL: nil,
                        body: "Resolved after refreshing the lockfile.",
                        createdAt: Date().addingTimeInterval(-2_300),
                        url: nil,
                        reactions: [],
                        path: nil,
                        threadID: "dependency-note",
                        isResolved: true,
                        isOutdated: false,
                        line: nil,
                        startLine: nil,
                        isBot: false
                    ),
                ],
                checks: [],
                files: [],
                reviewers: [
                    HostedReviewReviewer(
                        login: "reviewer",
                        name: "Review Owner",
                        avatarURL: nil,
                        status: "Requested"
                    )
                ],
                repoIdentity: HostedReviewRepoIdentity(owner: "xinyao27", repo: "yiru"),
                headSHA: "de7b1a4"
            )
        }

        func hostedReviewChecks(
            for _: String,
            workspace _: WorkspaceSummary,
            review _: HostedReview,
            details _: HostedReviewDetails?
        ) async throws -> [HostedReviewCheck] {
            [
                HostedReviewCheck(
                    name: "iOS build",
                    status: .completed,
                    conclusion: "success",
                    url: nil,
                    checkRunID: 1,
                    workflowRunID: nil
                ),
                HostedReviewCheck(
                    name: "Repository contracts",
                    status: .completed,
                    conclusion: "failure",
                    url: nil,
                    checkRunID: 2,
                    workflowRunID: nil
                ),
            ]
        }

        func hostedReviewCheckDetails(
            for _: String,
            workspace _: WorkspaceSummary,
            review _: HostedReview,
            details _: HostedReviewDetails?,
            check: HostedReviewCheck
        ) async throws -> HostedReviewCheckRunDetails? {
            HostedReviewCheckRunDetails(
                name: check.name,
                status: check.status.rawValue,
                conclusion: check.conclusion,
                url: check.url,
                detailsURL: check.url,
                title: check.outcome == .failure ? "Build failed" : nil,
                summary: check.outcome == .failure ? "One compile step failed." : nil,
                text: nil,
                annotations: [],
                jobs: []
            )
        }

        func hostedReviewAssignableUsers(for _: String, workspace _: WorkspaceSummary) async throws
            -> [HostedReviewUser]
        {
            [HostedReviewUser(login: "reviewer", name: "Review Owner", avatarURL: nil)]
        }

        func launchHostedReviewTriage(
            for _: String,
            workspaceID _: String,
            prompt _: String
        ) async throws {}

        func mutateHostedReview(
            for _: String,
            workspace _: WorkspaceSummary,
            review _: HostedReview,
            details _: HostedReviewDetails?,
            mutation _: HostedReviewMutation
        ) async throws {}

        private func entry(
            _ path: String,
            _ status: SourceFileStatus,
            _ area: SourceStagingArea,
            oldPath: String? = nil,
            added: Int? = nil,
            removed: Int? = nil
        ) -> SourceFileEntry {
            SourceFileEntry(
                path: path,
                status: status,
                area: area,
                oldPath: oldPath,
                conflictStatus: nil,
                added: added,
                removed: removed
            )
        }
    }

    extension WorkspaceSummary {
        nonisolated init(
            sourceFixtureID: String,
            repoID: String,
            repoName: String,
            branch: String,
            name: String,
            comment: String,
            isPinned: Bool,
            lastActivity: Date,
            activity: WorkspaceActivity
        ) {
            id = sourceFixtureID
            kind = .git
            self.repoID = repoID
            self.repoName = repoName
            path = "/work/\(sourceFixtureID)"
            self.branch = branch
            self.name = name
            workspaceStatus = "active"
            isArchived = false
            isMainWorktree = false
            reportedMainWorktree = false
            hasHostSidebarActivity = true
            worktreeInstanceID = "fixture-instance"
            lineageWorktreeInstanceID = nil
            parentWorktreeInstanceID = nil
            parentWorktreeID = nil
            childWorktreeIDs = []
            sortOrder = 0
            manualOrder = nil
            createdAt = nil
            linkedPullRequest = nil
            linkedGitLabMergeRequest = nil
            self.comment = comment
            self.isPinned = isPinned
            isActive = activity == .active
            isUnread = false
            liveTerminalCount = 1
            hasAttachedPty = true
            self.lastActivity = lastActivity
            lastOutput = lastActivity
            preview = ""
            self.activity = activity
            agents = []
        }
    }
#endif
