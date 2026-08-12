import Foundation
import Observation

nonisolated enum HostListPhase {
    case loading
    case loaded([HostProfile])
    case failed(LocalizedStringResource)
}

@Observable
final class HostListModel {
    private(set) var phase: HostListPhase = .loading
    private(set) var connectionSnapshots: [String: RuntimeConnectionSnapshot] = [:]

    @ObservationIgnored
    private let repository: any HostRepository
    @ObservationIgnored
    private let connectionRuntime: any HostConnectionRuntime

    init(repository: any HostRepository, connectionRuntime: any HostConnectionRuntime) {
        self.repository = repository
        self.connectionRuntime = connectionRuntime
    }

    func load() async {
        do {
            let hosts = try await repository.hosts()
                .sorted { $0.lastConnected > $1.lastConnected }
            guard !Task.isCancelled else { return }
            phase = .loaded(hosts)
        } catch {
            guard !Task.isCancelled else { return }
            phase = .failed("Yiru could not read the hosts stored on this device.")
        }
    }

    func observe() async {
        await load()
        guard case .loaded(let hosts) = phase else { return }
        let snapshots = await connectionRuntime.connectionSnapshots(
            forHostIDs: hosts.map(\.id)
        )
        for await snapshots in snapshots {
            guard !Task.isCancelled else { return }
            connectionSnapshots = snapshots
        }
    }

    func reconnect(hostID: String) async {
        await connectionRuntime.reconnect(hostID: hostID)
    }
}
