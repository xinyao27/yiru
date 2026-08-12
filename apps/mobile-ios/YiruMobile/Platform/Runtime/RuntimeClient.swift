actor RuntimeClient: HomeRuntime {
    private let hosts: any HostRepository

    init(hosts: any HostRepository) {
        self.hosts = hosts
    }

    func currentConnectionState() async -> RuntimeConnectionState {
        guard
            let host = try? await hosts.hosts().sorted(by: { $0.lastConnected > $1.lastConnected })
                .first
        else {
            return .unpaired
        }
        return .paired(hostName: host.name)
    }
}
