import SwiftUI

struct AppView: View {
    @Bindable var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack(path: $model.routes) {
            HomeView(
                runtime: model.dependencies.homeRuntime,
                refreshRevision: model.homeRevision,
                showHosts: model.showHosts,
                showPairing: model.showPairing,
                showTerminalSettings: model.showTerminalSettings,
                showTerminalPrototype: model.showTerminalPrototype,
                showDesignSystemCatalog: model.showDesignSystemCatalog
            )
            .navigationDestination(for: AppRoute.self) { route in
                switch route {
                case .designSystemCatalog:
                    DesignSystemCatalogView()
                case .hosts:
                    HostListView(
                        repository: model.dependencies.hostRepository,
                        connectionRuntime: model.dependencies.hostConnectionRuntime,
                        selectHost: model.showWorkspaces,
                        showPairing: model.showPairing
                    )
                case .workspaces(let host):
                    WorkspaceListView(
                        host: host,
                        repository: model.dependencies.workspaceRepository,
                        selectWorkspace: { model.showWorkspaceSession(host: host, workspace: $0) }
                    )
                case .workspaceSession(let host, let workspace):
                    TerminalWorkspaceView(
                        host: host,
                        workspace: workspace,
                        repository: model.dependencies.terminalWorkspaceRepository,
                        runtime: model.dependencies.terminalSessionRuntime,
                        displayModeRuntime: model.dependencies.terminalDisplayModeRuntime,
                        surfaceFactory: model.dependencies.terminalSurfaceFactory,
                        preferences: model.dependencies.terminalPreferences,
                        showSettings: model.showTerminalSettings
                    )
                case .terminal(let host, let terminal):
                    TerminalLiveView(
                        host: host,
                        terminal: terminal.target,
                        runtime: model.dependencies.terminalSessionRuntime,
                        displayModeRuntime: model.dependencies.terminalDisplayModeRuntime,
                        surfaceFactory: model.dependencies.terminalSurfaceFactory,
                        preferences: model.dependencies.terminalPreferences,
                        showSettings: model.showTerminalSettings
                    )
                case .terminalSettings:
                    TerminalSettingsView(preferences: model.dependencies.terminalPreferences)
                case .pair:
                    PairingScanView(onOffer: model.confirmPairing)
                case .pairConfirm(let offer):
                    PairingConfirmView(
                        offer: offer,
                        runtime: model.dependencies.pairingRuntime,
                        onPaired: model.finishPairing
                    )
                case .terminalPrototype:
                    TerminalPrototypeView(factory: model.dependencies.terminalSurfaceFactory)
                }
            }
        }
        .tint(Theme.Colors.accent)
        .onOpenURL(perform: model.handleOpenURL)
        .onChange(of: scenePhase) { _, nextPhase in
            guard nextPhase == .active else { return }
            Task { await model.dependencies.runtimeClient.applicationDidBecomeActive() }
        }
    }
}

#Preview {
    AppView(model: AppModel(dependencies: .live()))
}
