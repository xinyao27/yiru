import SwiftUI

struct AppView: View {
    @Bindable var model: AppModel

    var body: some View {
        NavigationStack(path: $model.routes) {
            HomeView(
                runtime: model.dependencies.homeRuntime,
                showDesignSystemCatalog: model.showDesignSystemCatalog
            )
            .navigationDestination(for: AppRoute.self) { route in
                switch route {
                case .designSystemCatalog:
                    DesignSystemCatalogView()
                }
            }
        }
        .tint(Theme.Colors.accent)
    }
}

#Preview {
    AppView(model: AppModel(dependencies: .live()))
}
