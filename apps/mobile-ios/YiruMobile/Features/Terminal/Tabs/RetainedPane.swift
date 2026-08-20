import SwiftUI

private struct RetainedTerminalPaneState: View {
    @State private var terminal: TerminalLiveModel
    @State private var chat: NativeChatModel
    @State private var interaction: NativeChatInteractionModel
    @State private var isShowingChat: Bool
    @State private var hasViewOverride: Bool
    @State private var isRenamePresented = false
    let host: HostProfile
    let worktreeID: String
    let tab: TerminalWorkspaceTab
    let target: TerminalTarget
    let preferences: TerminalPreferences
    let hostConnectionIsReady: Bool
    let settingsPreferences: SettingsPreferences
    let isVisible: Bool
    let topChrome: TerminalTabStrip?
    let activateSelection: () -> Void
    let closeTerminal: () -> Void
    let showQuickCommands: (() -> Void)?
    let showFiles: (() -> Void)?
    let showSourceControl: (() -> Void)?
    let showAgentHistory: (() -> Void)?
    let openTerminalFile: (TerminalFileOpenRequest) -> Void
    let openTerminalURL: (URL) -> Void

    init(
        host: HostProfile,
        worktreeID: String,
        tab: TerminalWorkspaceTab,
        target: TerminalTarget,
        runtime: any TerminalSessionRuntime,
        displayModeRuntime: any TerminalDisplayModeRuntime,
        surfaceFactory: any TerminalSurfaceFactory,
        nativeChatRepository: any NativeChatRepository,
        preferences: TerminalPreferences,
        hostConnectionIsReady: Bool,
        settingsPreferences: SettingsPreferences,
        isVisible: Bool,
        topChrome: TerminalTabStrip?,
        activateSelection: @escaping () -> Void,
        closeTerminal: @escaping () -> Void,
        showQuickCommands: (() -> Void)?,
        showFiles: (() -> Void)?,
        showSourceControl: (() -> Void)?,
        showAgentHistory: (() -> Void)?,
        openTerminalFile: @escaping (TerminalFileOpenRequest) -> Void,
        openTerminalURL: @escaping (URL) -> Void
    ) {
        _terminal = State(
            initialValue: TerminalLiveModel(
                host: host,
                terminal: target,
                runtime: runtime,
                displayModeRuntime: displayModeRuntime,
                surfaceFactory: surfaceFactory,
                surfaceConfiguration: preferences.surfaceConfiguration
            )
        )
        _chat = State(
            initialValue: NativeChatModel(
                hostID: host.id,
                worktreeID: worktreeID,
                tabID: tab.id,
                repository: nativeChatRepository
            )
        )
        _interaction = State(
            initialValue: NativeChatInteractionModel(
                hostID: host.id,
                worktreeID: worktreeID,
                repository: nativeChatRepository
            )
        )
        let stored = NativeChatViewPreference.storedMode(
            hostID: host.id,
            worktreeID: worktreeID,
            tabID: tab.id
        )
        _hasViewOverride = State(initialValue: stored != nil)
        _isShowingChat = State(
            initialValue: tab.canShowNativeChat
                && (stored ?? tab.preferredViewMode
                    ?? (settingsPreferences.defaultSessionView == .chat ? .chat : .terminal))
                    == .chat
        )
        self.host = host
        self.worktreeID = worktreeID
        self.tab = tab
        self.target = target
        self.preferences = preferences
        self.hostConnectionIsReady = hostConnectionIsReady
        self.settingsPreferences = settingsPreferences
        self.isVisible = isVisible
        self.topChrome = topChrome
        self.activateSelection = activateSelection
        self.closeTerminal = closeTerminal
        self.showQuickCommands = showQuickCommands
        self.showFiles = showFiles
        self.showSourceControl = showSourceControl
        self.showAgentHistory = showAgentHistory
        self.openTerminalFile = openTerminalFile
        self.openTerminalURL = openTerminalURL
    }

    var body: some View {
        ZStack {
            terminalPane

            if showsChat {
                chatPane
            }
        }
        .onChange(of: settingsPreferences.defaultSessionView) { _, value in
            guard !hasViewOverride, tab.preferredViewMode == nil else { return }
            isShowingChat = tab.canShowNativeChat && value == .chat
        }
        .onChange(of: tab.canShowNativeChat) { _, canShowNativeChat in
            guard !hasViewOverride, canShowNativeChat else { return }
            isShowingChat = automaticViewMode == .chat
        }
        .onChange(of: tab.preferredViewMode) { _, preferredViewMode in
            guard !hasViewOverride, tab.canShowNativeChat, let preferredViewMode else { return }
            isShowingChat = preferredViewMode == .chat
        }
        .onChange(of: terminal.hasSubscribed, initial: true) { _, _ in
            activateSelectionIfReady()
        }
        .onChange(of: isVisible, initial: true) { _, _ in
            activateSelectionIfReady()
        }
        .environment(\.terminalTabContextActions, terminalTabContextActions)
        .sheet(isPresented: $isRenamePresented) {
            TerminalRenameSheet(title: terminal.title) { title in
                Task { await terminal.rename(title) }
            }
        }
    }

    private var showsChat: Bool { isShowingChat && tab.canShowNativeChat }

    private func activateSelectionIfReady() {
        guard isVisible, terminal.hasSubscribed else { return }
        activateSelection()
    }

    private var automaticViewMode: TerminalTabViewMode {
        tab.preferredViewMode
            ?? (settingsPreferences.defaultSessionView == .chat ? .chat : .terminal)
    }

    private var terminalPane: some View {
        TerminalLivePane(
            model: terminal,
            preferences: preferences,
            hostConnectionIsReady: hostConnectionIsReady,
            isVisible: isVisible && !showsChat,
            topChrome: topChrome,
            closeTerminal: closeTerminal,
            showQuickCommands: showQuickCommands,
            showFiles: showFiles,
            showSourceControl: showSourceControl,
            showAgentHistory: showAgentHistory,
            switchToChat: switchToChatAction,
            imageAttachment: TerminalImageAttachment(
                isPending: interaction.isAttaching,
                picked: attachImageToTerminal,
                failed: interaction.reportAttachmentFailure
            ),
            openTerminalFile: openTappedFile,
            openTerminalURL: openTerminalURL
        )
        .opacity(showsChat ? 0 : 1)
        .allowsHitTesting(!showsChat)
        .accessibilityHidden(showsChat)
    }

    private var chatPane: some View {
        NativeChatConversationView(
            model: chat,
            interaction: interaction,
            terminal: terminal,
            tab: tab,
            topChrome: topChrome,
            hostConnectionIsReady: hostConnectionIsReady
        )
        .toolbar {
            if showsChat && isVisible {
                ToolbarItem(placement: .topBarTrailing) { chatMenu }
            }
        }
    }

    private var switchToChatAction: (() -> Void)? {
        guard tab.canShowNativeChat else { return nil }
        return toggleView
    }

    private var chatMenu: some View {
        Menu {
            Button(action: toggleView) {
                Label("Switch to terminal view", iconID: .terminal)
            }
            if let showQuickCommands {
                Button(action: showQuickCommands) {
                    Label("Quick commands", iconID: .arrowRight)
                }
            }
            if let showFiles {
                Button(action: showFiles) {
                    Label("Open file explorer", iconID: .folder)
                }
            }
            if let showSourceControl {
                Button(action: showSourceControl) {
                    Label("Open source control", iconID: .gitBranch)
                }
            }
            if let showAgentHistory {
                Button(action: showAgentHistory) {
                    Label("Agent History", iconID: .history)
                }
            }
        } label: {
            YiruToolbarIcon(.more)
        }
        .accessibilityLabel("More session actions")
    }

    private var terminalTabContextActions: TerminalTabContextActions {
        TerminalTabContextActions(
            viewMode: showsChat ? .chat : .terminal,
            switchView: switchToChatAction,
            displayMode: terminal.displayMode,
            isDisplayModeUpdating: terminal.isDisplayModeUpdating,
            toggleDisplayMode: { Task { await terminal.toggleDisplayMode() } },
            rename: { isRenamePresented = true },
            clear: { Task { await terminal.clear() } },
            close: closeTerminal
        )
    }

    private func toggleView() {
        let next = showsChat ? TerminalTabViewMode.terminal : .chat
        isShowingChat = next == .chat
        hasViewOverride = true
        NativeChatViewPreference.save(
            next,
            hostID: host.id,
            worktreeID: worktreeID,
            tabID: tab.id
        )
    }

    private func attachImageToTerminal(_ data: Data) {
        interaction.attachImage(data, terminalID: terminal.identifier) { payload in
            await terminal.sendChatMessageConfirmed(payload, enter: false)
        }
    }

    private func openTappedFile(_ tappedFile: TerminalTappedFile) {
        openTerminalFile(
            TerminalFileOpenRequest(
                hostID: host.id,
                worktreeID: worktreeID,
                terminalID: target.id,
                cwd: terminal.currentDirectory,
                tappedFile: tappedFile
            )
        )
    }
}

struct RetainedTerminalPane: View {
    let host: HostProfile
    let worktreeID: String
    let tab: TerminalWorkspaceTab
    let target: TerminalTarget
    let runtime: any TerminalSessionRuntime
    let displayModeRuntime: any TerminalDisplayModeRuntime
    let surfaceFactory: any TerminalSurfaceFactory
    let nativeChatRepository: any NativeChatRepository
    let preferences: TerminalPreferences
    let hostConnectionIsReady: Bool
    let settingsPreferences: SettingsPreferences
    let isVisible: Bool
    let topChrome: TerminalTabStrip?
    let activateSelection: () -> Void
    let closeTerminal: () -> Void
    let showQuickCommands: (() -> Void)?
    let showFiles: (() -> Void)?
    let showSourceControl: (() -> Void)?
    let showAgentHistory: (() -> Void)?
    let openTerminalFile: (TerminalFileOpenRequest) -> Void
    let openTerminalURL: (URL) -> Void

    var body: some View {
        RetainedTerminalPaneState(
            host: host,
            worktreeID: worktreeID,
            tab: tab,
            target: target,
            runtime: runtime,
            displayModeRuntime: displayModeRuntime,
            surfaceFactory: surfaceFactory,
            nativeChatRepository: nativeChatRepository,
            preferences: preferences,
            hostConnectionIsReady: hostConnectionIsReady,
            settingsPreferences: settingsPreferences,
            isVisible: isVisible,
            topChrome: topChrome,
            activateSelection: activateSelection,
            closeTerminal: closeTerminal,
            showQuickCommands: showQuickCommands,
            showFiles: showFiles,
            showSourceControl: showSourceControl,
            showAgentHistory: showAgentHistory,
            openTerminalFile: openTerminalFile,
            openTerminalURL: openTerminalURL
        )
    }
}
