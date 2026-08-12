struct AppDependencies: Sendable {
    let hostRepository: any HostRepository
    let homeRuntime: any HomeRuntime
    let pairingRuntime: any PairingRuntime

    static func live() -> AppDependencies {
        let hosts = KeychainHostRepository()
        return AppDependencies(
            hostRepository: hosts,
            homeRuntime: RuntimeClient(hosts: hosts),
            pairingRuntime: DirectPairingClient(hosts: hosts)
        )
    }
}
