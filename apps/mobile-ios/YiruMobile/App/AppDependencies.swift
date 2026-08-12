struct AppDependencies: Sendable {
    let homeRuntime: any HomeRuntime

    static func live() -> AppDependencies {
        AppDependencies(homeRuntime: RuntimeClient())
    }
}
