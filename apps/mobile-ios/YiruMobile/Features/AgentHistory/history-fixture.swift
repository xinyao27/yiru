#if DEBUG
    import Foundation
    import SwiftUI

    struct AgentHistoryFixtureView: View {
        private let repository = AgentHistoryFixtureRepository()

        var body: some View {
            NavigationStack {
                AgentHistoryView(
                    host: HostProfile(
                        id: "fixture-host",
                        name: "Mac Studio",
                        endpoint: "wss://fixture.invalid",
                        publicKeyBase64: "fixture",
                        lastConnected: Date()
                    ),
                    workspace: repository.workspace,
                    repository: repository,
                    workspaceRepository: repository,
                    connectionRuntime: repository,
                    showWorkspaceSession: { _ in }
                )
            }
        }
    }

    nonisolated struct AgentHistoryFixtureRepository: AgentHistoryRepository,
        WorkspaceRepository, HostConnectionRuntime
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

        let workspace = WorkspaceSummary(
            historyFixtureID: "liquid-glass",
            repoID: "yiru",
            repoName: "Yiru",
            path: "/work/yiru/liquid-glass",
            branch: "feat/liquid-glass",
            name: "liquid-glass"
        )

        func supportsAgentHistory(for _: String) async -> Bool { true }

        func agentHistory(for _: String, scopePaths _: [String], force _: Bool) async throws
            -> AgentHistorySnapshot
        {
            let now = Date()
            return AgentHistorySnapshot(
                sessions: [
                    AgentHistorySession(
                        fixtureID: "claude-1",
                        agent: "claude",
                        title: "Match the mobile workspace list precisely",
                        cwd: "/work/yiru/liquid-glass",
                        updatedAt: now.addingTimeInterval(-8 * 60),
                        messages: [
                            AgentHistoryMessage(
                                role: "user",
                                text: "Please preserve every spacing and icon detail.",
                                timestamp: nil
                            ),
                            AgentHistoryMessage(
                                role: "assistant",
                                text:
                                    "I am comparing the native rows against the Expo implementation.",
                                timestamp: nil
                            ),
                        ]
                    ),
                    AgentHistorySession(
                        fixtureID: "codex-1",
                        agent: "codex",
                        title: "Build the Liquid Glass design system",
                        cwd: "/work/yiru/liquid-glass",
                        updatedAt: now.addingTimeInterval(-3 * 3_600),
                        messages: [
                            AgentHistoryMessage(
                                role: "assistant",
                                text:
                                    "The semantic gray loader and action colors are now consistent.",
                                timestamp: nil
                            )
                        ]
                    ),
                    AgentHistorySession(
                        fixtureID: "gemini-1",
                        agent: "gemini",
                        title: "Research browser interaction parity",
                        cwd: "/work/yiru/main",
                        updatedAt: now.addingTimeInterval(-2 * 86_400),
                        messages: [
                            AgentHistoryMessage(
                                role: "user",
                                text: "Check touch, keyboard, and navigation behavior.",
                                timestamp: nil
                            )
                        ]
                    ),
                ],
                issues: [
                    AgentHistoryIssue(
                        agent: "claude",
                        path: "/work/yiru/.claude/broken.jsonl",
                        message: "Transcript is incomplete"
                    )
                ]
            )
        }

        func resumeAgentHistorySession(
            for _: String,
            workspace _: WorkspaceSummary,
            session _: AgentHistorySession,
            mutationID _: String
        ) async throws {}

        func workspaces(for _: String) async throws -> WorkspaceSnapshot {
            WorkspaceSnapshot(workspaces: [workspace], repos: [], totalCount: 1, isTruncated: false)
        }

        func allWorkspaceTabUpdates(for _: String) async throws
            -> AsyncThrowingStream<[String: [WorkspaceOpenTab]], Error>
        {
            AsyncThrowingStream { $0.finish() }
        }

        func activateWorkspace(hostID _: String, workspaceID _: String) async throws {}
        func sleepWorkspace(hostID _: String, workspaceID _: String) async throws {}
        func setWorkspacePinned(hostID _: String, workspaceID _: String, isPinned _: Bool)
            async throws
        {}
        func removeWorkspace(hostID _: String, workspaceID _: String) async throws {}
    }

    private extension AgentHistorySession {
        nonisolated init(
            fixtureID: String,
            agent: String,
            title: String,
            cwd: String,
            updatedAt: Date,
            messages: [AgentHistoryMessage]
        ) {
            id = fixtureID
            self.agent = agent
            sessionID = fixtureID
            self.title = title
            self.cwd = cwd
            filePath = "\(cwd)/.sessions/\(fixtureID).jsonl"
            codexHome = nil
            createdAt = updatedAt.addingTimeInterval(-3_600).ISO8601Format()
            self.updatedAt = updatedAt.ISO8601Format()
            modifiedAt = updatedAt.ISO8601Format()
            messageCount = messages.count
            queuedMessageCount = 0
            subagentTranscriptCount = 0
            previewMessages = messages
            resumeCommand = "agent resume \(fixtureID)"
        }
    }

    private extension WorkspaceSummary {
        nonisolated init(
            historyFixtureID: String,
            repoID: String,
            repoName: String,
            path: String,
            branch: String,
            name: String
        ) {
            id = historyFixtureID
            kind = .git
            self.repoID = repoID
            self.repoName = repoName
            self.path = path
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
            comment = ""
            isPinned = false
            isActive = true
            isUnread = false
            liveTerminalCount = 1
            hasAttachedPty = true
            lastActivity = Date()
            lastOutput = Date()
            preview = ""
            activity = .active
            agents = []
        }
    }
#endif
