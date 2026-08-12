enum RuntimeConnectionState: Equatable, Sendable {
    case unpaired
    case connecting
    case connected(hostName: String)
    case unavailable
}
