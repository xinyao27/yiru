#if DEBUG
    import SwiftUI

    private enum SettingsFixtureRoute: Hashable {
        case appearance
        case chat
        case terminal
        case browser
        case notifications
        case troubleshooting
        case connectionLog
        case about
        case designSystem
    }

    struct SettingsFixtureView: View {
        let dependencies: AppDependencies
        @State private var path: [SettingsFixtureRoute]

        init(dependencies: AppDependencies) {
            self.dependencies = dependencies
            _path = State(initialValue: Self.initialPath)
        }

        var body: some View {
            NavigationStack(path: $path) {
                SettingsView(
                    credentialCleanupRepository: dependencies.credentialCleanupRepository,
                    showAppearance: { path.append(.appearance) },
                    showChat: { path.append(.chat) },
                    showTerminal: { path.append(.terminal) },
                    showBrowser: { path.append(.browser) },
                    showNotifications: { path.append(.notifications) },
                    showTroubleshooting: { path.append(.troubleshooting) },
                    showAbout: { path.append(.about) },
                    showDesignSystem: { path.append(.designSystem) },
                    showsDebugNavigation: true
                )
                .navigationDestination(for: SettingsFixtureRoute.self) { route in
                    destination(route)
                }
            }
        }

        private static var initialPath: [SettingsFixtureRoute] {
            let arguments = ProcessInfo.processInfo.arguments
            if arguments.contains("--chat-settings-fixture") { return [.chat] }
            if arguments.contains("--terminal-settings-fixture") { return [.terminal] }
            if arguments.contains("--browser-settings-fixture") { return [.browser] }
            if arguments.contains("--notification-settings-fixture") { return [.notifications] }
            if arguments.contains("--troubleshooting-fixture") { return [.troubleshooting] }
            if arguments.contains("--connection-log-fixture") { return [.connectionLog] }
            if arguments.contains("--about-fixture") { return [.about] }
            return []
        }

        @ViewBuilder
        private func destination(_ route: SettingsFixtureRoute) -> some View {
            switch route {
            case .appearance:
                AppearanceSettingsView(preferences: dependencies.settingsPreferences)
            case .chat:
                ChatSettingsView(preferences: dependencies.settingsPreferences)
            case .terminal:
                TerminalSettingsView(
                    preferences: dependencies.terminalPreferences,
                    hosts: dependencies.hostRepository,
                    autoRestoreRepository: dependencies.runtimeClient
                )
            case .browser:
                BrowserSettingsView(preferences: dependencies.settingsPreferences)
            case .notifications:
                NotificationSettingsView()
            case .troubleshooting:
                TroubleshootingView(
                    repository: dependencies.hostRepository,
                    showConnectionLog: { path.append(.connectionLog) }
                )
            case .connectionLog:
                ConnectionLogView(
                    hosts: dependencies.hostRepository,
                    diagnostics: dependencies.connectionDiagnosticsRepository
                )
            case .about:
                AboutView()
            case .designSystem:
                DesignSystemCatalogView()
            }
        }
    }
#endif
