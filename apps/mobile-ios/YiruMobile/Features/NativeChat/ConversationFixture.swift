#if DEBUG
    import Foundation
    import SwiftUI

    nonisolated enum NativeChatFixtureScenario: String, CaseIterable, Identifiable, Sendable {
        case chat
        case working
        case permission
        case empty
        case error

        var id: Self { self }

        var title: LocalizedStringResource {
            switch self {
            case .chat: "Chat transcript"
            case .working: "Agent working"
            case .permission: "Permission request"
            case .empty: "Empty chat"
            case .error: "Chat error"
            }
        }
    }

    struct NativeChatFixtureView: View {
        let scenario: NativeChatFixtureScenario
        @State private var model: NativeChatModel
        @State private var interaction: NativeChatInteractionModel
        @State private var terminal: TerminalLiveModel

        init(scenario: NativeChatFixtureScenario) {
            self.scenario = scenario
            let repository = NativeChatFixtureRepository(scenario: scenario)
            let runtime = TerminalActionFixtureRuntime()
            let host = HostProfile(
                id: "fixture-host",
                name: "Mac Studio",
                endpoint: "wss://fixture.invalid",
                publicKeyBase64: "fixture",
                lastConnected: Date()
            )
            _model = State(
                initialValue: NativeChatModel(
                    hostID: host.id,
                    worktreeID: "fixture-worktree",
                    tabID: "fixture-terminal",
                    repository: repository,
                    defaults: UserDefaults(suiteName: "yiru.native-chat-fixture") ?? .standard
                )
            )
            _interaction = State(
                initialValue: NativeChatInteractionModel(
                    hostID: host.id,
                    worktreeID: "fixture-worktree",
                    repository: repository
                )
            )
            _terminal = State(
                initialValue: TerminalLiveModel(
                    host: host,
                    terminal: TerminalTarget(
                        id: "terminal:fixture",
                        title: "Codex fixture",
                        isWritable: true
                    ),
                    runtime: runtime,
                    displayModeRuntime: runtime,
                    surfaceFactory: SwiftTermSurfaceFactory(),
                    surfaceConfiguration: .standard()
                )
            )
        }

        var body: some View {
            NavigationStack {
                NativeChatConversationView(
                    model: model,
                    interaction: interaction,
                    terminal: terminal,
                    tab: fixtureTab,
                    topChrome: TerminalTabStrip(
                        tabs: fixtureTabs,
                        activeTabID: "fixture-terminal",
                        isDisabled: false,
                        selectTab: { _ in },
                        closeTab: { _ in },
                        navigateBrowser: { _, _ in },
                        createTerminal: {}
                    )
                )
                .navigationTitle("Liquid Glass mobile")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button("Switch to Terminal", iconID: .terminal) {}
                            Button("Terminal Settings", iconID: .settings) {}
                        } label: {
                            YiruToolbarIcon(.more)
                        }
                        .accessibilityLabel("More session actions")
                    }
                }
            }
            .task { await terminal.connect(attempt: 0) }
        }

        private var fixtureTabs: [TerminalWorkspaceTab] {
            [
                fixtureTab,
                TerminalWorkspaceTab(
                    id: "fixture-markdown",
                    title: "markdown-fixture.md",
                    isActive: false,
                    isPinned: false,
                    leafID: nil,
                    content: .markdown(
                        WorkspaceMarkdownTab(
                            relativePath: "markdown-fixture.md",
                            documentVersion: "fixture",
                            isHostDirty: false
                        )
                    )
                ),
                TerminalWorkspaceTab(
                    id: "fixture-browser",
                    title: "Yiru UI Lab",
                    isActive: false,
                    isPinned: false,
                    leafID: nil,
                    content: .browser(
                        WorkspaceBrowserTab(
                            workspaceID: "fixture-workspace",
                            pageID: "fixture-page",
                            url: "https://yiru.app/ui-lab",
                            isLoading: false,
                            canGoBack: true,
                            canGoForward: false
                        )
                    )
                ),
            ]
        }

        private var fixtureTab: TerminalWorkspaceTab {
            TerminalWorkspaceTab(
                id: "fixture-terminal",
                title: "Codex fixture",
                isActive: true,
                isPinned: false,
                leafID: "fixture-leaf",
                content: .terminal(
                    .ready(
                        TerminalTarget(
                            id: "terminal:fixture",
                            title: "Codex fixture",
                            isWritable: true
                        )
                    )
                ),
                launchAgent: "codex",
                agentStatus: fixtureAgentStatus,
                preferredViewMode: .chat
            )
        }

        private var fixtureAgentStatus: NativeChatAgentStatus {
            NativeChatAgentStatus(
                state: scenario == .working
                    ? "working" : scenario == .permission ? "blocked" : "done",
                paneKey: "fixture-tab:fixture-pane",
                prompt: "Review the fixture",
                updatedAt: 0,
                stateStartedAt: 0,
                agent: "codex",
                interactivePrompt: scenario == .permission
                    ? #"{"approval":{"tool":"Edit","summary":"Update StructuredMarkdown.swift"}}"#
                    : nil,
                lastAssistantMessage: scenario == .working
                    ? "I’m checking the final layout and streaming this response into the transcript…"
                    : nil,
                toolName: scenario == .permission ? "Edit" : nil,
                toolInput: scenario == .permission
                    ? "apps/mobile-ios/YiruMobile/DesignSystem/Components/StructuredMarkdown.swift"
                    : nil,
                isInterrupted: false,
                providerSession: NativeChatProviderSession(
                    id: "fixture-session",
                    transcriptPath: "/fixture/session.jsonl"
                )
            )
        }
    }

    nonisolated struct NativeChatFixtureRepository: NativeChatRepository {
        let scenario: NativeChatFixtureScenario

        func nativeChatUpdates(
            for _: String,
            agent _: String,
            sessionID _: String,
            transcriptPath _: String?,
            limit _: Int
        ) async throws -> AsyncThrowingStream<NativeChatFrame, Error> {
            AsyncThrowingStream { continuation in
                continuation.yield(
                    .snapshot(
                        messages: messages,
                        hasMore: false,
                        beforeOffset: nil,
                        error: scenario == .error
                            ? "The transcript fixture could not be loaded."
                            : nil
                    )
                )
            }
        }

        func readNativeChat(
            for _: String,
            agent _: String,
            sessionID _: String,
            transcriptPath _: String?,
            beforeOffset _: Int?,
            limit _: Int
        ) async throws -> NativeChatPage {
            NativeChatPage(messages: messages, hasMore: false, beforeOffset: 0)
        }

        func searchNativeChatFiles(
            for _: String,
            worktreeID _: String,
            query _: String,
            limit _: Int
        ) async throws -> [String] {
            filePaths
        }

        func listNativeChatFiles(for _: String, worktreeID _: String) async throws -> [String] {
            filePaths
        }

        func openNativeChatFile(
            for _: String,
            worktreeID _: String,
            pathText _: String,
            terminalID _: String?
        ) async throws {}

        func uploadNativeChatImage(for _: String, data _: Data) async throws -> String {
            "/tmp/yiru-mobile-fixture.png"
        }

        private var messages: [NativeChatMessage] {
            guard scenario != .empty, scenario != .error else { return [] }
            return [
                NativeChatMessage(
                    id: "fixture-user",
                    role: .user,
                    blocks: [
                        .text(
                            "Review the mobile Markdown renderer and keep the implementation clean."
                        )
                    ],
                    timestamp: Date(timeIntervalSince1970: 1),
                    source: .transcript,
                    turnID: nil
                ),
                NativeChatMessage(
                    id: "fixture-reasoning",
                    role: .reasoning,
                    blocks: [
                        .text("I’ll inspect the renderer and its theme integration.")
                    ],
                    timestamp: Date(timeIntervalSince1970: 2),
                    source: .transcript,
                    turnID: nil
                ),
                NativeChatMessage(
                    id: "fixture-assistant",
                    role: .assistant,
                    blocks: [
                        .text(
                            #"""
                            # Markdown renderer

                            Body text with **bold**, *italic*, ~~strikethrough~~, `inline code`, and a
                            [safe link](https://example.com). A detected project path should also be tappable:
                            `apps/mobile-ios/YiruMobile/DesignSystem/Components/StructuredMarkdown.swift:86`.

                            > Blockquotes use the same quiet border and surface tokens as the production chat.

                            ## Lists and tasks

                            - A short unordered item
                            - A wrapped item that is deliberately long enough to exercise line wrapping on a narrow phone

                            1. First ordered item
                            2. Second ordered item

                            - [x] Native renderer installed
                            - [ ] Check both light and dark appearances

                            ## Table

                            | Surface | State | Notes |
                            | --- | --- | --- |
                            | Chat | Ready | Production component |
                            | Markdown | Working | Native rendering |
                            | Composer | Interactive | Local echo only |

                            ## Code

                            ```tsx
                            export function Greeting({ name }: { name: string }) {
                              return <Text>Hello, {name}</Text>
                            }
                            ```

                            ## Math

                            Inline math: $E = mc^2$.

                            $$
                            \int_0^1 x^2\,dx = \frac{1}{3}
                            $$

                            ---

                            中文、emoji 与混合排版：你好 Yiru 👋 — this line checks multilingual wrapping.

                            I also checked the production component directly.
                            """#
                        ),
                        .toolCall(
                            name: "Read",
                            input: .object([
                                NativeChatField(
                                    key: "file_path",
                                    value: .string(
                                        "apps/mobile-ios/YiruMobile/DesignSystem/Components/StructuredMarkdown.swift"
                                    )
                                )
                            ]),
                            callID: "fixture-read"
                        ),
                        .toolResult(
                            output: "Read 212 lines from the Markdown renderer.",
                            isError: false,
                            callID: "fixture-read",
                            segments: nil
                        ),
                    ],
                    timestamp: Date(timeIntervalSince1970: 3),
                    source: .transcript,
                    turnID: nil
                ),
            ]
        }

        private var filePaths: [String] {
            [
                "apps/mobile-ios/YiruMobile/DesignSystem/Components/StructuredMarkdown.swift",
                "apps/mobile-ios/YiruMobile/Features/NativeChat/MessageRow.swift",
                "apps/mobile-ios/YiruMobile/Features/NativeChat/ConversationView.swift",
            ]
        }
    }
#endif
