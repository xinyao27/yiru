#if DEBUG
    import Foundation
    import SwiftUI

    struct WorkspaceListFixtureView: View {
        private let repository = WorkspaceListFixtureRepository()

        var body: some View {
            NavigationStack {
                WorkspaceListView(
                    host: HostProfile(
                        id: "fixture-host",
                        name: "Mac Studio",
                        endpoint: "wss://fixture.invalid",
                        publicKeyBase64: "fixture",
                        lastConnected: Date()
                    ),
                    repository: repository,
                    creationRepository: repository,
                    agentHistoryRepository: repository,
                    hostRepository: repository,
                    connectionRuntime: repository,
                    showAccounts: {},
                    showSourceControl: { _ in },
                    showAgentHistory: { _ in },
                    showPairing: {},
                    selectWorkspace: { _, _ in }
                )
            }
        }
    }

    struct WorkspaceCreationFixtureView: View {
        @State private var isPresented = false
        private let repository = WorkspaceListFixtureRepository()

        var body: some View {
            NavigationStack {
                Theme.Colors.background
                    .ignoresSafeArea()
                    .navigationTitle("Mac Studio")
            }
            .sheet(isPresented: $isPresented) {
                WorkspaceCreationSheet(
                    host: HostProfile(
                        id: "fixture-host",
                        name: "Mac Studio",
                        endpoint: "wss://fixture.invalid",
                        publicKeyBase64: "fixture",
                        lastConnected: Date()
                    ),
                    existingPaths: ["/work/yiru/main", "/work/yiru/nautilus"],
                    existingBranchesByRepo: ["yiru": ["main"]],
                    repository: repository,
                    onCreated: { _ in }
                )
            }
            .task { isPresented = true }
        }
    }

    struct WorkspaceActionsFixtureView: View {
        @State private var isPresented = false

        var body: some View {
            NavigationStack {
                Theme.Colors.background
                    .ignoresSafeArea()
                    .navigationTitle("Yiru")
            }
            .sheet(isPresented: $isPresented) {
                WorkspaceActionsSheet(
                    workspace: fixtureWorkspace,
                    isBusy: false,
                    showsAgentHistory: true,
                    showSourceControl: {},
                    showAgentHistory: {},
                    sleep: {},
                    togglePin: {},
                    remove: {}
                )
            }
            .task { isPresented = true }
        }

        private var fixtureWorkspace: WorkspaceSummary {
            WorkspaceSummary(
                fixtureID: "liquid-glass",
                repoID: "yiru",
                repoName: "Yiru",
                branch: "feat/liquid-glass",
                name: "liquid-glass",
                comment: "Native SwiftUI rewrite",
                isPinned: false,
                lastActivity: Date(),
                activity: .active
            )
        }
    }

    nonisolated struct WorkspaceListFixtureRepository: WorkspaceRepository,
        WorkspaceCreationRepository, AgentHistoryRepository, HostRepository,
        HostConnectionRuntime
    {
        private let snapshot: WorkspaceSnapshot
        private let tabs: [String: [WorkspaceOpenTab]]

        func hosts() async throws -> [HostProfile] { [] }

        func credential(for _: String) async throws -> HostCredential? { nil }

        func saveAuthenticatedOffer(_: PairingOffer, connectedAt _: Date) async throws
            -> HostProfile
        {
            throw WorkspaceRepositoryError.rejectedMutation
        }

        func updateHost(hostID _: String, name _: String, endpoint _: String) async throws
            -> HostProfile
        {
            throw WorkspaceRepositoryError.rejectedMutation
        }

        func removeHost(hostID _: String) async throws {}

        func connectionSnapshots(forHostIDs _: [String]) async -> AsyncStream<
            [String: RuntimeConnectionSnapshot]
        > {
            AsyncStream { continuation in
                continuation.yield([
                    "fixture-host": RuntimeConnectionSnapshot(
                        hostID: "fixture-host",
                        hostName: "Mac Studio",
                        phase: .connected,
                        reconnectAttempt: 0,
                        lastConnectedAt: Date()
                    )
                ])
                continuation.finish()
            }
        }

        func disconnect(hostID _: String) async {}

        func supportsAgentHistory(for _: String) async -> Bool { true }

        func agentHistory(for _: String, scopePaths _: [String], force _: Bool) async throws
            -> AgentHistorySnapshot
        {
            AgentHistorySnapshot(sessions: [], issues: [])
        }

        func resumeAgentHistorySession(
            for _: String,
            workspace _: WorkspaceSummary,
            session _: AgentHistorySession,
            mutationID _: String
        ) async throws {}

        init() {
            let now = Date()
            let main = WorkspaceSummary(
                fixtureID: "main",
                repoID: "yiru",
                repoName: "Yiru",
                branch: "main",
                name: "main",
                isMainWorktree: true,
                isPinned: true,
                isUnread: true,
                lastActivity: now.addingTimeInterval(-80),
                activity: .working,
                agents: [
                    WorkspaceAgent(
                        fixturePaneKey: "terminal-main:root",
                        state: .working,
                        agentType: "claude",
                        prompt: "Match the mobile workspace list",
                        lastAssistantMessage: "Refining the workspace list details",
                        stateStartedAt: now.addingTimeInterval(-7 * 60),
                        updatedAt: now
                    )
                ]
            )
            let child = WorkspaceSummary(
                fixtureID: "liquid-glass",
                repoID: "yiru",
                repoName: "Yiru",
                branch: "feat/liquid-glass",
                name: "liquid-glass",
                worktreeInstanceID: "child-instance",
                lineageWorktreeInstanceID: "child-instance",
                parentWorktreeInstanceID: "main-instance",
                parentWorktreeID: "main",
                linkedPullRequest: WorkspacePullRequest(number: 8498, state: "open"),
                comment: "Native SwiftUI rewrite",
                isUnread: true,
                lastActivity: now.addingTimeInterval(-4 * 60),
                activity: .permission,
                agents: [
                    WorkspaceAgent(
                        fixturePaneKey: "terminal-child:root",
                        state: .waiting,
                        agentType: "codex",
                        prompt: "Review the Liquid Glass migration",
                        lastAssistantMessage: "Waiting for your approval",
                        stateStartedAt: now.addingTimeInterval(-12 * 60),
                        updatedAt: now
                    )
                ]
            )
            let folder = WorkspaceSummary(
                fixtureID: "design-notes",
                kind: .folderWorkspace,
                repoID: "notes",
                repoName: "Design Notes",
                path: "/Users/xinyao27/Design Notes",
                branch: "",
                name: "Liquid Glass references",
                comment: "iOS 26 visual research",
                lastActivity: now.addingTimeInterval(-24 * 60),
                activity: .active
            )
            let repos = [
                WorkspaceRepo(
                    fixtureID: "yiru",
                    name: "Yiru",
                    icon: .lucide(name: "Code2")
                ),
                WorkspaceRepo(
                    fixtureID: "notes",
                    name: "Design Notes",
                    icon: .emoji("📝")
                ),
            ]
            snapshot = WorkspaceSnapshot(
                workspaces: [main, child, folder],
                repos: repos,
                totalCount: 3,
                isTruncated: false
            )
            tabs = [
                "main": [
                    WorkspaceOpenTab(
                        id: "terminal-main",
                        title: "Refining the workspace list details",
                        kind: .terminal,
                        isActive: true
                    ),
                    WorkspaceOpenTab(
                        id: "design-file",
                        title: "WorkspaceListView.swift",
                        kind: .file,
                        isActive: false
                    ),
                ],
                "liquid-glass": [
                    WorkspaceOpenTab(
                        id: "terminal-child",
                        title: "Waiting for your approval",
                        kind: .terminal,
                        isActive: true
                    )
                ],
                "design-notes": [
                    WorkspaceOpenTab(
                        id: "research",
                        title: "Apple Design Resources",
                        kind: .browser,
                        isActive: true
                    )
                ],
            ]
        }

        func workspaces(for _: String) async throws -> WorkspaceSnapshot { snapshot }

        func allWorkspaceTabUpdates(for _: String) async throws
            -> AsyncThrowingStream<[String: [WorkspaceOpenTab]], Error>
        {
            AsyncThrowingStream { continuation in
                continuation.yield(tabs)
            }
        }

        func activateWorkspace(hostID _: String, workspaceID _: String) async throws {}

        func sleepWorkspace(hostID _: String, workspaceID _: String) async throws {}

        func setWorkspacePinned(
            hostID _: String,
            workspaceID _: String,
            isPinned _: Bool
        ) async throws {}

        func removeWorkspace(hostID _: String, workspaceID _: String) async throws {}

        func reconnect(hostID _: String) async {}

        func workspaceCreationOptions(for _: String) async throws -> WorkspaceCreationOptions {
            WorkspaceCreationOptions(
                repos: snapshot.repos,
                agents: [workspaceCreationAgentCatalog[0], workspaceCreationAgentCatalog[3]] + [
                    WorkspaceCreationAgent(
                        id: WorkspaceCreationAgent.blankID,
                        label: "Blank Terminal",
                        launchCommand: nil
                    )
                ],
                preferredAgentID: "claude",
                trustedHooks: [:],
                isGitLabAvailable: true
            )
        }

        func workspaceTerminalAgents(for _: String, repoID _: String?) async throws
            -> [WorkspaceCreationAgent]
        {
            [workspaceCreationAgentCatalog[0], workspaceCreationAgentCatalog[3]]
        }

        func workspaceSetupDetails(for _: String, repoID: String) async throws
            -> WorkspaceSetupDetails
        {
            guard repoID == "yiru" else { return .empty }
            return WorkspaceSetupDetails(
                wire: MobileRepoHooksResultWire(
                    hooks: MobileRepoHooksWire(
                        scripts: MobileRepoHookScriptsWire(setup: "pnpm install")
                    ),
                    setupRunPolicy: .ask,
                    source: "yiru.yaml",
                    setupTrust: MobileWorkspaceSetupTrustWire(
                        contentHash: "fixture-setup-v1",
                        scriptContent: "pnpm install"
                    )
                )
            )
        }

        func workspaceSourceRefs(for _: String, repoID _: String, query: String) async throws
            -> [WorkspaceSourceRef]
        {
            let refs = [
                WorkspaceSourceRef(refName: "main", localBranchName: "main"),
                WorkspaceSourceRef(
                    refName: "origin/feat/liquid-glass",
                    localBranchName: "feat/liquid-glass"
                ),
                WorkspaceSourceRef(refName: "release/ios-26", localBranchName: "release/ios-26"),
            ]
            guard !query.isEmpty else { return refs }
            return refs.filter {
                $0.refName.localizedCaseInsensitiveContains(query)
                    || $0.localBranchName.localizedCaseInsensitiveContains(query)
            }
        }

        func workspaceHostedSources(
            for _: String,
            repoID _: String,
            provider: WorkspaceHostedSourceProvider,
            query _: String,
            gitLabState _: WorkspaceGitLabMRState
        ) async throws -> [WorkspaceHostedSource] {
            switch provider {
            case .github:
                [
                    WorkspaceHostedSource(
                        wire: MobileWorkspaceSourceItemWire(
                            id: "8498",
                            type: .pr,
                            number: 8498,
                            title: "Ship the native iOS app",
                            state: "open",
                            url: "https://github.com/yiru-ai/yiru/pull/8498",
                            branchName: "feat/native-ios",
                            baseRefName: "main",
                            isCrossRepository: false
                        ),
                        provider: .github
                    )
                ]
            case .gitlab:
                [
                    WorkspaceHostedSource(
                        wire: MobileWorkspaceSourceItemWire(
                            id: "26",
                            type: .mr,
                            number: 26,
                            title: "Adopt Liquid Glass",
                            state: "opened",
                            url: "https://gitlab.com/yiru/yiru/-/merge_requests/26",
                            branchName: "feat/liquid-glass",
                            baseRefName: "main",
                            isCrossRepository: false
                        ),
                        provider: .gitlab
                    )
                ]
            }
        }

        func resolveWorkspaceHostedSource(
            for _: String,
            repoID _: String,
            source _: WorkspaceHostedSource
        ) async throws -> WorkspaceHostedBase {
            WorkspaceHostedBase(
                baseBranch: "main",
                compareBaseRef: "main",
                pushTarget: nil,
                branchNameOverride: "feat/native-ios"
            )
        }

        func workspacePastedGitHubSource(
            for _: String,
            repoID _: String,
            number: Int,
            slug _: WorkspaceRepoSlug?
        ) async throws -> WorkspaceHostedSource? {
            WorkspaceHostedSource(
                wire: MobileWorkspaceSourceItemWire(
                    id: "pr-\(number)",
                    type: .pr,
                    number: number,
                    title: "Ship the native iOS app",
                    state: "open",
                    url: "https://github.com/xinyao27/yiru/pull/\(number)",
                    branchName: "feat/native-ios",
                    baseRefName: "main",
                    isCrossRepository: false
                ),
                provider: .github
            )
        }

        func workspacePastedGitLabSource(
            for _: String,
            repoID _: String,
            host _: String,
            path _: String,
            number: Int
        ) async throws -> WorkspaceHostedSource? {
            WorkspaceHostedSource(
                wire: MobileWorkspaceSourceItemWire(
                    id: "mr-\(number)",
                    type: .mr,
                    number: number,
                    title: "Adopt Liquid Glass",
                    state: "opened",
                    url: "https://gitlab.com/yiru/mobile/-/merge_requests/\(number)",
                    branchName: "feat/liquid-glass",
                    baseRefName: "main",
                    isCrossRepository: false
                ),
                provider: .gitlab
            )
        }

        func workspaceRepoSlug(for _: String, repoID: String) async throws -> WorkspaceRepoSlug? {
            repoID == "yiru" ? WorkspaceRepoSlug(owner: "xinyao27", repo: "yiru") : nil
        }

        func persistWorkspaceSetupTrust(
            for _: String,
            trustedHooks: WorkspaceTrustedHooks
        ) async throws -> WorkspaceTrustedHooks {
            trustedHooks
        }

        func createWorkspace(
            for _: String,
            draft _: WorkspaceCreationDraft,
            existingPaths _: [String]
        ) async throws -> WorkspaceSummary {
            snapshot.workspaces[0]
        }
    }

    private extension WorkspaceAgent {
        nonisolated init(
            fixturePaneKey: String,
            state: WorkspaceAgentState,
            agentType: String,
            prompt: String,
            lastAssistantMessage: String,
            stateStartedAt: Date,
            updatedAt: Date
        ) {
            paneKey = fixturePaneKey
            parentPaneKey = nil
            self.state = state
            self.agentType = agentType
            self.prompt = prompt
            displayName = nil
            self.lastAssistantMessage = lastAssistantMessage
            interrupted = false
            self.stateStartedAt = stateStartedAt
            self.updatedAt = updatedAt
        }
    }

    private extension WorkspaceRepo {
        nonisolated init(fixtureID: String, name: String, icon: WorkspaceRepoIcon) {
            id = fixtureID
            path = "/work/\(fixtureID)"
            self.name = name
            badgeColor = "blue"
            connectionID = nil
            self.icon = icon
            kind = fixtureID == "notes" ? .folder : .git
            slug = fixtureID == "yiru" ? WorkspaceRepoSlug(owner: "xinyao27", repo: "yiru") : nil
            remoteURL = fixtureID == "yiru" ? "git@github.com:xinyao27/yiru.git" : nil
        }
    }

    private extension WorkspaceSummary {
        nonisolated init(
            fixtureID: String,
            kind: WorkspaceKind = .git,
            repoID: String,
            repoName: String,
            path: String = "",
            branch: String,
            name: String,
            isMainWorktree: Bool = false,
            worktreeInstanceID: String? = "main-instance",
            lineageWorktreeInstanceID: String? = nil,
            parentWorktreeInstanceID: String? = nil,
            parentWorktreeID: String? = nil,
            linkedPullRequest: WorkspacePullRequest? = nil,
            comment: String = "",
            isPinned: Bool = false,
            isUnread: Bool = false,
            lastActivity: Date,
            activity: WorkspaceActivity,
            agents: [WorkspaceAgent] = []
        ) {
            id = fixtureID
            self.kind = kind
            self.repoID = repoID
            self.repoName = repoName
            self.path = path
            self.branch = branch
            self.name = name
            workspaceStatus = "active"
            isArchived = false
            self.isMainWorktree = isMainWorktree
            reportedMainWorktree = isMainWorktree
            hasHostSidebarActivity = activity != .inactive
            self.worktreeInstanceID = worktreeInstanceID
            self.lineageWorktreeInstanceID = lineageWorktreeInstanceID
            self.parentWorktreeInstanceID = parentWorktreeInstanceID
            self.parentWorktreeID = parentWorktreeID
            childWorktreeIDs = []
            sortOrder = 0
            manualOrder = nil
            createdAt = nil
            self.linkedPullRequest = linkedPullRequest
            linkedGitLabMergeRequest = nil
            self.comment = comment
            self.isPinned = isPinned
            isActive = activity == .active
            self.isUnread = isUnread
            liveTerminalCount = agents.isEmpty ? 0 : 1
            hasAttachedPty = !agents.isEmpty
            self.lastActivity = lastActivity
            lastOutput = lastActivity
            preview = ""
            self.activity = activity
            self.agents = agents
        }
    }
#endif
