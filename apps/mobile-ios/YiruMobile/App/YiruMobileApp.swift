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
            AppView(model: model)
        }
    }
}
