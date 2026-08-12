import SwiftUI

struct AppView: View {
    @Bindable var model: AppModel

    var body: some View {
        NavigationStack(path: $model.routes) {
            HomeView(
                runtime: model.dependencies.homeRuntime,
                refreshRevision: model.homeRevision,
                showHosts: model.showHosts,
                showPairing: model.showPairing,
                showDesignSystemCatalog: model.showDesignSystemCatalog
            )
            .navigationDestination(for: AppRoute.self) { route in
                switch route {
                case .designSystemCatalog:
                    DesignSystemCatalogView()
                case .hosts:
                    HostListView(
                        repository: model.dependencies.hostRepository,
                        showPairing: model.showPairing
                    )
                case .pair:
                    PairingScanView(onOffer: model.confirmPairing)
                case .pairConfirm(let offer):
                    PairingConfirmView(
                        offer: offer,
                        runtime: model.dependencies.pairingRuntime,
                        onPaired: model.finishPairing
                    )
                }
            }
        }
        .tint(Theme.Colors.accent)
        .onOpenURL(perform: model.handleOpenURL)
    }
}

#Preview {
    AppView(model: AppModel(dependencies: .live()))
}
