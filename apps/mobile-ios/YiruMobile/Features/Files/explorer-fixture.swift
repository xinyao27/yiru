#if DEBUG
    import Foundation
    import SwiftUI

    struct WorkspaceFileExplorerFixtureView: View {
        private let repository = WorkspaceFileExplorerFixtureRepository()
        private let workspace = WorkspaceSummary(filesFixtureID: "liquid-glass")

        var body: some View {
            NavigationStack {
                WorkspaceFileExplorerView(
                    host: HostProfile(
                        id: "fixture-host",
                        name: "Mac Studio",
                        endpoint: "wss://fixture.invalid",
                        publicKeyBase64: "fixture",
                        lastConnected: Date()
                    ),
                    workspace: workspace,
                    repository: repository,
                    connectionRuntime: repository,
                    openFile: { _, _ in }
                )
            }
        }
    }

    struct WorkspaceFilePreviewFixtureView: View {
        private let repository = SessionContentFixtureRepository()
        private let workspace = WorkspaceSummary(filesFixtureID: "liquid-glass")

        var body: some View {
            NavigationStack {
                WorkspaceFilePreviewView(
                    host: HostProfile(
                        id: "fixture-host",
                        name: "Mac Studio",
                        endpoint: "wss://fixture.invalid",
                        publicKeyBase64: "fixture",
                        lastConnected: Date()
                    ),
                    workspace: workspace,
                    target: WorkspaceFilePreviewTarget(
                        source: .worktree(relativePath: "package.json"),
                        title: "package.json",
                        line: 2,
                        column: 3
                    ),
                    repository: repository,
                    connectionRuntime: repository
                )
            }
        }
    }

    nonisolated struct WorkspaceFileExplorerFixtureRepository: WorkspaceFilesRepository,
        HostConnectionRuntime
    {
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

        func reconnect(hostID _: String) async {}
        func disconnect(hostID _: String) async {}

        func loadWorkspaceDirectory(
            for _: String,
            worktreeID _: String,
            relativePath: String
        ) async throws -> WorkspaceDirectoryLoad {
            let entries: [WorkspaceDirectoryEntry] =
                switch relativePath {
                case "":
                    [
                        entry("apps", directory: true),
                        entry("packages", directory: true),
                        entry("README.md"),
                        entry("design.png"),
                        entry("archive.zip"),
                        entry("package.json"),
                    ]
                case "apps":
                    [
                        entry("mobile", directory: true),
                        entry("mobile-ios", directory: true),
                    ]
                default: []
                }
            return .entries(entries)
        }

        private func entry(_ name: String, directory: Bool = false) -> WorkspaceDirectoryEntry {
            WorkspaceDirectoryEntry(name: name, isDirectory: directory, isSymlink: false)
        }

        func liveWorktreeDisplayName(for _: String, worktreeID _: String) async -> String? { nil }
    }

    private extension WorkspaceSummary {
        nonisolated init(filesFixtureID: String) {
            id = filesFixtureID
            kind = .git
            repoID = "yiru"
            repoName = "Yiru"
            path = "/work/yiru/liquid-glass"
            branch = "feat/liquid-glass"
            name = "liquid-glass"
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
