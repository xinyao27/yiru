import SwiftUI

struct TerminalPrototypeView: View {
    @State private var model: TerminalPrototypeModel
    @State private var activeTabID = "terminal"
    @State private var displayMode = TerminalDisplayMode.auto

    init(factory: any TerminalSurfaceFactory) {
        _model = State(initialValue: TerminalPrototypeModel(factory: factory))
    }

    var body: some View {
        VStack(spacing: 0) {
            TerminalTabStrip(
                tabs: Self.fixtureTabs,
                activeTabID: activeTabID,
                isDisabled: false,
                selectTab: { activeTabID = $0.id },
                closeTab: { _ in },
                navigateBrowser: { _, _ in },
                createTerminal: {}
            )

            TerminalSurfaceHost(surface: model.surface)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, TerminalChromeMetrics.horizontalInset)
                .background(Theme.Colors.background)
                .clipped()
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    TerminalAccessoryDock(
                        state: model.surface.accessoryState,
                        displayMode: displayMode,
                        isDisplayModeUpdating: false,
                        toggleDisplayMode: {
                            displayMode = displayMode.toggleTarget
                        }
                    )
                }
        }
        .navigationTitle(Text("megamouth"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Show Keyboard", iconID: .terminal, action: model.focus)
                } label: {
                    YiruToolbarIcon(.more)
                }
                .accessibilityLabel("More session actions")
            }
        }
        .onAppear(perform: model.loadFixture)
    }

    private static let fixtureTabs = [
        TerminalWorkspaceTab(
            id: "terminal",
            title: "Claude Code",
            isActive: true,
            isPinned: false,
            leafID: "root",
            content: .terminal(
                .ready(TerminalTarget(id: "fixture", title: "Claude Code", isWritable: true))
            )
        ),
        TerminalWorkspaceTab(
            id: "markdown",
            title: "README.md",
            isActive: false,
            isPinned: false,
            leafID: nil,
            content: .markdown(
                WorkspaceMarkdownTab(
                    relativePath: "README.md",
                    documentVersion: "fixture",
                    isHostDirty: false
                )
            )
        ),
        TerminalWorkspaceTab(
            id: "browser",
            title: "Apple Design Resources",
            isActive: false,
            isPinned: false,
            leafID: nil,
            content: .browser(
                WorkspaceBrowserTab(
                    workspaceID: "fixture",
                    pageID: "page",
                    url: "https://developer.apple.com/design/resources/",
                    isLoading: false,
                    canGoBack: false,
                    canGoForward: false
                )
            )
        ),
    ]
}
