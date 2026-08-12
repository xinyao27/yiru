import Observation

@Observable
final class HomeModel {
    private(set) var phase: HomePhase = .loading

    @ObservationIgnored
    private let runtime: any HomeRuntime

    init(runtime: any HomeRuntime) {
        self.runtime = runtime
    }

    func refresh() async {
        let state = await runtime.currentConnectionState()
        guard !Task.isCancelled else { return }
        phase = .loaded(state)
    }
}
