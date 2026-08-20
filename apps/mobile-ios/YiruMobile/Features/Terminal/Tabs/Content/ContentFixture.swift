#if DEBUG
    import SwiftUI

    struct SessionContentFixtureView: View {
        @State private var activeTabID: String
        private let repository = SessionContentFixtureRepository()

        init() {
            _activeTabID = State(
                initialValue: ProcessInfo.processInfo.arguments.contains("--session-diff-fixture")
                    ? "diff" : "markdown"
            )
        }

        var body: some View {
            NavigationStack {
                VStack(spacing: 0) {
                    TerminalTabStrip(
                        tabs: tabs,
                        activeTabID: activeTabID,
                        isDisabled: false,
                        selectTab: { activeTabID = $0.id },
                        closeTab: { _ in },
                        navigateBrowser: { _, _ in },
                        createTerminal: {}
                    )
                    activeContent
                }
                .background(Theme.Colors.background)
                .navigationTitle("liquid-glass")
                .navigationBarTitleDisplayMode(.inline)
            }
        }

        @ViewBuilder
        private var activeContent: some View {
            if let tab = tabs.first(where: { $0.id == activeTabID }) {
                switch tab.content {
                case .markdown(let descriptor):
                    WorkspaceMarkdownPane(
                        hostID: "fixture-host",
                        worktreeID: "fixture-worktree",
                        tab: tab,
                        descriptor: descriptor,
                        repository: repository,
                        draftChanged: { _ in }
                    )
                case .file(let descriptor):
                    WorkspaceFilePane(
                        hostID: "fixture-host",
                        worktreeID: "fixture-worktree",
                        title: tab.title,
                        descriptor: descriptor,
                        repository: repository,
                        connectionRuntime: repository
                    )
                case .terminal, .browser:
                    EmptyView()
                }
            }
        }

        private var tabs: [TerminalWorkspaceTab] {
            [
                TerminalWorkspaceTab(
                    id: "markdown",
                    title: "README.md",
                    isActive: activeTabID == "markdown",
                    isPinned: false,
                    leafID: nil,
                    content: .markdown(
                        WorkspaceMarkdownTab(
                            relativePath: "README.md",
                            documentVersion: "fixture-1",
                            isHostDirty: false
                        )
                    )
                ),
                TerminalWorkspaceTab(
                    id: "file",
                    title: "package.json",
                    isActive: activeTabID == "file",
                    isPinned: false,
                    leafID: nil,
                    content: .file(
                        WorkspaceFileTab(
                            relativePath: "package.json",
                            language: "json",
                            diffSource: nil
                        )
                    )
                ),
                TerminalWorkspaceTab(
                    id: "diff",
                    title: "changes.swift",
                    isActive: activeTabID == "diff",
                    isPinned: false,
                    leafID: nil,
                    content: .file(
                        WorkspaceFileTab(
                            relativePath: "changes.swift",
                            language: "swift",
                            diffSource: .unstaged
                        )
                    )
                ),
                TerminalWorkspaceTab(
                    id: "html",
                    title: "preview.html",
                    isActive: activeTabID == "html",
                    isPinned: false,
                    leafID: nil,
                    content: .file(
                        WorkspaceFileTab(
                            relativePath: "preview.html",
                            language: "html",
                            diffSource: nil
                        )
                    )
                ),
            ]
        }
    }

    nonisolated struct SessionContentFixtureRepository: WorkspaceContentRepository,
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

        func readWorkspaceMarkdown(
            for _: String,
            worktreeID _: String,
            tab _: TerminalWorkspaceTab,
            descriptor _: WorkspaceMarkdownTab
        ) async throws -> WorkspaceMarkdownDocument {
            WorkspaceMarkdownDocument(
                content:
                    "# Yiru\n\nNative iOS 26 workspace companion.\n\n- Liquid Glass controls\n- SwiftTerm sessions\n- Markdown editing\n",
                version: "fixture-1",
                editable: true,
                isHostDirty: false,
                readOnlyReason: nil
            )
        }

        func saveWorkspaceMarkdown(
            for _: String,
            worktreeID _: String,
            tabID _: String,
            baseVersion _: String,
            content: String
        ) async throws -> WorkspaceMarkdownDocument {
            WorkspaceMarkdownDocument(
                content: content,
                version: "fixture-2",
                editable: true,
                isHostDirty: false,
                readOnlyReason: nil
            )
        }

        func readWorkspaceFile(
            for _: String,
            worktreeID _: String,
            descriptor: WorkspaceFileTab
        ) async throws -> WorkspaceFileDocument {
            if descriptor.diffSource != nil {
                let result = WorkspaceDiffBuilder.build(
                    originalContent:
                        "struct Workspace {\n    let name: String\n    let host: String\n}\n",
                    modifiedContent:
                        "struct Workspace {\n    let name: String\n    let hostID: String\n    let isPinned: Bool\n}\n"
                )
                return .diff(lines: result.lines, isTruncated: result.isTruncated)
            }
            if descriptor.relativePath.hasSuffix(".html") {
                return .html(
                    content:
                        "<html><body style='font: -apple-system-body; padding: 24px'><h1>Yiru Preview</h1><p>Rendered on the native iOS client.</p></body></html>",
                    isTruncated: false
                )
            }
            return .text(
                content: "{\n  \"name\": \"yiru\",\n  \"platform\": \"ios26\"\n}\n",
                isTruncated: false,
                byteLength: 53
            )
        }

        func liveWorktreeDisplayName(for _: String, worktreeID _: String) async -> String? { nil }
    }
#endif
