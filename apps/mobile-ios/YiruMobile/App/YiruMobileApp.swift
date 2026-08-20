import SwiftUI

@main
struct YiruMobileApp: App {
    @State private var model: AppModel

    init() {
        let dependencies = AppDependencies.live()
        _model = State(initialValue: AppModel(dependencies: dependencies))
    }

    var body: some Scene {
        WindowGroup {
            rootView
                .environment(
                    \.appLoaderStyle,
                    model.dependencies.settingsPreferences.loaderStyle
                )
                .progressViewStyle(YiruProgressViewStyle())
                .preferredColorScheme(model.dependencies.settingsPreferences.themeMode.colorScheme)
                // Why: Liquid Glass derives ordinary button labels from the environment tint.
                // Selection is a surface token, so using it here makes every ordinary action
                // render with a low-contrast grey label. Foreground keeps the default action
                // neutral; selected and destructive controls opt into their semantic tokens.
                .tint(Theme.Colors.foreground)
                .onOpenURL(perform: model.handleOpenURL)
                .task {
                    model.handleDevelopmentPairingLaunchIfNeeded()
                }
        }
    }

    @ViewBuilder
    private var rootView: some View {
        #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--home-fixture") {
                HomeFixtureView(scenario: .dashboard)
            } else if ProcessInfo.processInfo.arguments.contains("--home-onboarding-fixture") {
                HomeFixtureView(scenario: .onboarding)
            } else if ProcessInfo.processInfo.arguments.contains("--activity-fixture") {
                ActivityInsightsFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--pairing-scan-fixture") {
                PairingScanFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--pairing-confirm-fixture") {
                PairingConfirmFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--notification-opt-in-fixture") {
                NotificationOptInView(onFinished: {})
            } else if ProcessInfo.processInfo.arguments.contains("--workspace-list-fixture") {
                WorkspaceListFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--accounts-fixture") {
                AccountFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--workspace-create-fixture") {
                WorkspaceCreationFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--settings-fixture") {
                SettingsFixtureView(dependencies: model.dependencies)
            } else if ProcessInfo.processInfo.arguments.contains("--chat-settings-fixture")
                || ProcessInfo.processInfo.arguments.contains("--terminal-settings-fixture")
                || ProcessInfo.processInfo.arguments.contains("--browser-settings-fixture")
                || ProcessInfo.processInfo.arguments.contains("--notification-settings-fixture")
                || ProcessInfo.processInfo.arguments.contains("--troubleshooting-fixture")
                || ProcessInfo.processInfo.arguments.contains("--connection-log-fixture")
                || ProcessInfo.processInfo.arguments.contains("--about-fixture")
            {
                SettingsFixtureView(dependencies: model.dependencies)
            } else if ProcessInfo.processInfo.arguments.contains("--ui-lab-fixture") {
                NavigationStack {
                    VisualParityCatalogView(dependencies: model.dependencies)
                }
            } else if ProcessInfo.processInfo.arguments.contains("--appearance-fixture") {
                NavigationStack {
                    AppearanceSettingsView(
                        preferences: model.dependencies.settingsPreferences
                    )
                }
            } else if ProcessInfo.processInfo.arguments.contains("--design-system-fixture") {
                NavigationStack {
                    DesignSystemCatalogView()
                }
            } else if ProcessInfo.processInfo.arguments.contains("--workspace-actions-fixture") {
                WorkspaceActionsFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--host-edit-fixture") {
                NavigationStack {
                    HostEditView(
                        host: HostProfile(
                            id: "fixture-host",
                            name: "Mac Studio",
                            endpoint: "wss://mac-studio.local:6768",
                            publicKeyBase64: "fixture",
                            lastConnected: Date()
                        ),
                        repository: model.dependencies.hostRepository,
                        connectionRuntime: model.dependencies.hostConnectionRuntime,
                        onSaved: { _ in }
                    )
                }
            } else if ProcessInfo.processInfo.arguments.contains("--terminal-chrome-fixture") {
                NavigationStack {
                    TerminalPrototypeView(factory: SwiftTermSurfaceFactory())
                }
            } else if ProcessInfo.processInfo.arguments.contains("--terminal-actions-fixture") {
                TerminalActionFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--terminal-reconnecting-fixture")
            {
                TerminalActionFixtureView(reconnects: true)
            } else if ProcessInfo.processInfo.arguments.contains("--chat-working-fixture") {
                NativeChatFixtureView(scenario: .working)
            } else if ProcessInfo.processInfo.arguments.contains("--chat-permission-fixture") {
                NativeChatFixtureView(scenario: .permission)
            } else if ProcessInfo.processInfo.arguments.contains("--chat-empty-fixture") {
                NativeChatFixtureView(scenario: .empty)
            } else if ProcessInfo.processInfo.arguments.contains("--chat-error-fixture") {
                NativeChatFixtureView(scenario: .error)
            } else if ProcessInfo.processInfo.arguments.contains("--chat-fixture") {
                NativeChatFixtureView(scenario: .chat)
            } else if ProcessInfo.processInfo.arguments.contains("--session-content-fixture") {
                SessionContentFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--browser-fixture") {
                WorkspaceBrowserFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--agent-history-fixture") {
                AgentHistoryFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--files-fixture") {
                WorkspaceFileExplorerFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--file-preview-fixture") {
                WorkspaceFilePreviewFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--source-control-fixture") {
                SourceControlFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--commit-history-fixture") {
                SourceControlFixtureView(showCommitHistory: true)
            } else if ProcessInfo.processInfo.arguments.contains("--source-review-fixture") {
                SourceReviewFixtureView()
            } else if ProcessInfo.processInfo.arguments.contains("--hosted-review-fixture") {
                SourceControlFixtureView(showHostedReview: true)
            } else {
                AppView(model: model)
            }
        #else
            AppView(model: model)
        #endif
    }
}
