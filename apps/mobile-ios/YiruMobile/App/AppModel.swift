import Foundation
import Observation

@Observable
@MainActor
final class AppModel {
    let dependencies: AppDependencies
    var routes: [AppRoute] = []
    private(set) var homeRevision = 0

    init(dependencies: AppDependencies) {
        self.dependencies = dependencies
    }

    func showDesignSystemCatalog() {
        routes.append(.designSystemCatalog)
    }

    func showPairing() {
        routes.append(.pair)
    }

    func confirmPairing(_ offer: PairingOffer) {
        routes.append(.pairConfirm(offer))
    }

    func finishPairing(_: HostProfile) {
        routes.removeAll()
        homeRevision += 1
    }

    func handleOpenURL(_ url: URL) {
        guard let offer = try? PairingCodeDecoder().decode(url.absoluteString) else { return }
        routes = [.pairConfirm(offer)]
    }
}
