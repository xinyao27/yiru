struct AppDependencies: Sendable {
    let hostRepository: any HostRepository
    let hostConnectionRuntime: any HostConnectionRuntime
    let homeRuntime: any HomeRuntime
    let pairingRuntime: any PairingRuntime
    let runtimeClient: RuntimeClient
    let terminalRepository: any TerminalRepository
    let terminalSurfaceFactory: any TerminalSurfaceFactory
    let workspaceRepository: any WorkspaceRepository

    static func live() -> AppDependencies {
        let hosts = KeychainHostRepository()
        let runtime = RuntimeClient(hosts: hosts)
        return AppDependencies(
            hostRepository: hosts,
            hostConnectionRuntime: runtime,
            homeRuntime: runtime,
            pairingRuntime: DirectPairingClient(hosts: hosts),
            runtimeClient: runtime,
            terminalRepository: runtime,
            terminalSurfaceFactory: SwiftTermSurfaceFactory(),
            workspaceRepository: runtime
        )
    }
}
