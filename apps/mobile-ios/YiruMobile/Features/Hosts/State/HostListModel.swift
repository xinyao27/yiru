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

    @ObservationIgnored
    private let repository: any HostRepository

    init(repository: any HostRepository) {
        self.repository = repository
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
}
