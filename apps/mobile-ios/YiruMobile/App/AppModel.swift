import Observation

@Observable
final class AppModel {
    let dependencies: AppDependencies
    var routes: [AppRoute] = []

    init(dependencies: AppDependencies) {
        self.dependencies = dependencies
    }

    func showDesignSystemCatalog() {
        routes.append(.designSystemCatalog)
    }
}
