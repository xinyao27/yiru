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
                        selectWorkspace: { model.showTerminals(host: host, workspace: $0) }
                    )
                case .terminals(let host, let workspace):
                    TerminalListView(
                        host: host,
                        workspace: workspace,
                        repository: model.dependencies.terminalRepository,
                        selectTerminal: { model.showTerminal(host: host, terminal: $0) }
                    )
                case .terminal(let host, let terminal):
                    TerminalLiveView(
                        host: host,
                        terminal: terminal,
                        runtime: model.dependencies.terminalSessionRuntime,
                        surfaceFactory: model.dependencies.terminalSurfaceFactory
                    )
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
