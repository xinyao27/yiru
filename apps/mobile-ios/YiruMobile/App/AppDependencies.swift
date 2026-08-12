struct AppDependencies: Sendable {
    let homeRuntime: any HomeRuntime
    let pairingRuntime: any PairingRuntime

    static func live() -> AppDependencies {
        let hosts = KeychainHostRepository()
        return AppDependencies(
            homeRuntime: RuntimeClient(hosts: hosts),
            pairingRuntime: DirectPairingClient(hosts: hosts)
        )
    }
}
