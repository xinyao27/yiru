enum HomePhase: Equatable {
    case loading
    case loaded(RuntimeConnectionState)
}
