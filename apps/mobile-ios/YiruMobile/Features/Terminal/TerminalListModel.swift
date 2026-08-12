import Foundation
import Observation

nonisolated enum TerminalListPhase {
    case loading
    case loaded(TerminalSnapshot)
    case failed(LocalizedStringResource)
}

@Observable
final class TerminalListModel {
    private(set) var phase: TerminalListPhase = .loading

    @ObservationIgnored
    private let hostID: String
    @ObservationIgnored
    private let worktreeID: String
    @ObservationIgnored
    private let repository: any TerminalRepository

    init(hostID: String, worktreeID: String, repository: any TerminalRepository) {
        self.hostID = hostID
        self.worktreeID = worktreeID
        self.repository = repository
    }

    func load() async {
        do {
            let snapshot = try await repository.terminals(for: hostID, worktreeID: worktreeID)
            guard !Task.isCancelled else { return }
            phase = .loaded(snapshot)
        } catch is CancellationError {
            return
        } catch TerminalRepositoryError.timeout {
            phase = .failed("The host did not respond. Check its connection and try again.")
        } catch {
            phase = .failed("Yiru could not load terminals from this workspace.")
        }
    }

    func reconnectAndLoad() async {
        phase = .loading
        await repository.reconnectTerminalHost(hostID: hostID)
        await load()
    }
}
