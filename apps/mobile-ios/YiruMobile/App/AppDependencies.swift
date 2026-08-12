@MainActor
struct AppDependencies {
    let hostRepository: any HostRepository
    let hostConnectionRuntime: any HostConnectionRuntime
    let homeRuntime: any HomeRuntime
    let pairingRuntime: any PairingRuntime
    let runtimeClient: RuntimeClient
    let terminalRepository: any TerminalRepository
    let terminalPreferences: TerminalPreferences
    let terminalSessionRuntime: any TerminalSessionRuntime
    let terminalSurfaceFactory: any TerminalSurfaceFactory
    let workspaceRepository: any WorkspaceRepository

    static func live() -> AppDependencies {
        let hosts = KeychainHostRepository()
        let runtime = RuntimeClient(hosts: hosts)
        let terminalPreferences = TerminalPreferences(
            store: UserDefaultsTerminalPreferenceStore()
        )
        return AppDependencies(
            hostRepository: hosts,
            hostConnectionRuntime: runtime,
            homeRuntime: runtime,
            pairingRuntime: DirectPairingClient(hosts: hosts),
            runtimeClient: runtime,
            terminalRepository: runtime,
            terminalPreferences: terminalPreferences,
            terminalSessionRuntime: runtime,
            terminalSurfaceFactory: SwiftTermSurfaceFactory(),
            workspaceRepository: runtime
        )
    }
}
