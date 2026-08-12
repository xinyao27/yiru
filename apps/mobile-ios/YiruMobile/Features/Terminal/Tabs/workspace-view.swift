import SwiftUI

struct TerminalWorkspaceView: View {
    let workspace: WorkspaceSummary
    @State private var model: TerminalWorkspaceModel
    private let host: HostProfile
    private let runtime: any TerminalSessionRuntime
    private let displayModeRuntime: any TerminalDisplayModeRuntime
    private let surfaceFactory: any TerminalSurfaceFactory
    private let preferences: TerminalPreferences
    private let showSettings: () -> Void

    init(
        host: HostProfile,
        workspace: WorkspaceSummary,
        repository: any TerminalWorkspaceRepository,
        runtime: any TerminalSessionRuntime,
        displayModeRuntime: any TerminalDisplayModeRuntime,
        surfaceFactory: any TerminalSurfaceFactory,
        preferences: TerminalPreferences,
        showSettings: @escaping () -> Void
    ) {
        self.host = host
        self.workspace = workspace
        self.runtime = runtime
        self.displayModeRuntime = displayModeRuntime
        self.surfaceFactory = surfaceFactory
        self.preferences = preferences
        self.showSettings = showSettings
        _model = State(
            initialValue: TerminalWorkspaceModel(
                hostID: host.id,
                worktreeID: workspace.id,
                repository: repository
            )
        )
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                ProgressView("Loading workspace session…")
            case .loaded:
                workspaceContent
            case .failed(let message):
                ContentUnavailableView {
                    Label("Workspace session unavailable", systemImage: "rectangle.3.group")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") {
                        Task { await model.reconnectAndLoad() }
                    }
                    .buttonStyle(.glassProminent)
                }
            }
        }
        .navigationTitle(Text(workspace.name))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await model.observe()
        }
        .alert(
            "Tab action failed",
            isPresented: Binding(
                get: { model.mutationError != nil },
                set: { if !$0 { model.dismissMutationError() } }
            )
        ) {
            Button("OK", action: model.dismissMutationError)
        } message: {
            if let message = model.mutationError {
                Text(message)
            }
        }
    }

    @ViewBuilder
    private var workspaceContent: some View {
        if model.tabs.isEmpty {
            ContentUnavailableView {
                Label("No open tabs", systemImage: "rectangle.on.rectangle.slash")
            } description: {
                Text("Create a terminal to start working in this workspace.")
            } actions: {
                Button("New Terminal", systemImage: "plus") {
                    Task { await model.createTerminal() }
                }
                .buttonStyle(.glassProminent)
                .disabled(model.operation != nil)
            }
        } else {
            ZStack {
                retainedTerminals
                activeNonterminalContent
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                tabStrip
            }
        }
    }

    private var retainedTerminals: some View {
        ZStack {
            ForEach(model.retainedTerminalTabs) { tab in
                if let target = tab.terminalTarget {
                    RetainedTerminalPane(
                        host: host,
                        target: target,
                        runtime: runtime,
                        displayModeRuntime: displayModeRuntime,
                        surfaceFactory: surfaceFactory,
                        preferences: preferences,
                        isVisible: tab.id == model.activeTabID,
                        showSettings: showSettings
                    )
                    .id(tab.id)
                    .opacity(tab.id == model.activeTabID ? 1 : 0)
                    .allowsHitTesting(tab.id == model.activeTabID)
                    .accessibilityHidden(tab.id != model.activeTabID)
                }
            }
        }
    }

    @ViewBuilder
    private var activeNonterminalContent: some View {
        if let activeTab = model.activeTab {
            switch activeTab.content {
            case .terminal(.ready):
                EmptyView()
            case .terminal(.pending):
                ProgressView("Starting terminal…")
            case .markdown(let path):
                unavailableTab(
                    title: "Markdown preview is coming next",
                    systemImage: "doc.richtext",
                    detail: path
                )
            case .file(let path):
                unavailableTab(
                    title: "File preview is coming next",
                    systemImage: "doc.text",
                    detail: path
                )
            case .browser(let url):
                unavailableTab(
                    title: "Browser tabs are coming next",
                    systemImage: "globe",
                    detail: url
                )
            }
        }
    }

    private var tabStrip: some View {
        GlassEffectContainer(spacing: Theme.Spacing.small) {
            HStack(spacing: Theme.Spacing.small) {
                ScrollView(.horizontal) {
                    HStack(spacing: Theme.Spacing.small) {
                        ForEach(model.tabs) { tab in
                            tabButton(tab)
                        }
                    }
                }
                .scrollIndicators(.hidden)

                Button("New Terminal", systemImage: "plus") {
                    Task { await model.createTerminal() }
                }
                .labelStyle(.iconOnly)
                .buttonStyle(.glassProminent)
                .disabled(model.operation != nil)
            }
        }
        .padding(.horizontal, Theme.Spacing.standard)
        .padding(.vertical, Theme.Spacing.small)
    }

    @ViewBuilder
    private func tabButton(_ tab: TerminalWorkspaceTab) -> some View {
        let button = Button {
            Task { await model.select(tab) }
        } label: {
            Label(tab.title, systemImage: tab.systemImage)
                .lineLimit(1)
        }
        .contextMenu {
            Button("Close Tab", systemImage: "xmark", role: .destructive) {
                Task { await model.close(tab) }
            }
            .disabled(model.operation != nil)
        }
        .disabled(model.operation != nil && tab.id != model.activeTabID)

        if tab.id == model.activeTabID {
            button.buttonStyle(.glassProminent)
        } else {
            button.buttonStyle(.glass)
        }
    }

    private func unavailableTab(
        title: LocalizedStringResource,
        systemImage: String,
        detail: String?
    ) -> some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            if let detail, !detail.isEmpty {
                Text(detail)
            }
        }
    }
}
