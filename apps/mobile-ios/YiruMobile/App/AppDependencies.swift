struct AppDependencies: Sendable {
    let hostRepository: any HostRepository
    let homeRuntime: any HomeRuntime
    let pairingRuntime: any PairingRuntime
    let terminalSurfaceFactory: any TerminalSurfaceFactory
    let workspaceRepository: any WorkspaceRepository

    static func live() -> AppDependencies {
        let hosts = KeychainHostRepository()
        let runtime = RuntimeClient(hosts: hosts)
        return AppDependencies(
            hostRepository: hosts,
            homeRuntime: runtime,
            pairingRuntime: DirectPairingClient(hosts: hosts),
            terminalSurfaceFactory: SwiftTermSurfaceFactory(),
            workspaceRepository: runtime
        )
    }
}
