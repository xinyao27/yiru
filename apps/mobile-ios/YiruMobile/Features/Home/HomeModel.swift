import Observation

@Observable
@MainActor
final class HomeModel {
    private(set) var phase: HomePhase = .loading

    @ObservationIgnored
    private let runtime: any HomeRuntime

    init(runtime: any HomeRuntime) {
        self.runtime = runtime
    }

    func observe() async {
        phase = .loaded(await runtime.currentConnectionState())
        let states = await runtime.connectionStates()
        for await state in states {
            guard !Task.isCancelled else { return }
            phase = .loaded(state)
        }
    }

    func refresh() async {
        phase = .loaded(await runtime.currentConnectionState())
    }

    func reconnect() async {
        await runtime.reconnectMostRecentHost()
        let state = await runtime.currentConnectionState()
        guard !Task.isCancelled else { return }
        phase = .loaded(state)
    }
}
