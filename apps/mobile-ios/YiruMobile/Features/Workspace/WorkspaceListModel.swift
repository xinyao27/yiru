import Foundation
import Observation

nonisolated enum WorkspaceListPhase {
    case loading
    case loaded(WorkspaceSnapshot)
    case failed(LocalizedStringResource)
}

@Observable
final class WorkspaceListModel {
    private(set) var phase: WorkspaceListPhase = .loading

    @ObservationIgnored
    private let hostID: String
    @ObservationIgnored
    private let repository: any WorkspaceRepository

    init(hostID: String, repository: any WorkspaceRepository) {
        self.hostID = hostID
        self.repository = repository
    }

    func load() async {
        do {
            let snapshot = try await repository.workspaces(for: hostID)
            guard !Task.isCancelled else { return }
            phase = .loaded(snapshot)
        } catch is CancellationError {
            return
        } catch WorkspaceRepositoryError.timeout {
            phase = .failed("The host did not respond. Check its connection and try again.")
        } catch {
            phase = .failed("Yiru could not load workspaces from this host.")
        }
    }
}
