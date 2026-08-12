nonisolated enum RuntimeConnectionState: Equatable, Sendable {
    case unpaired
    case paired(hostName: String)
    case connecting
    case connected(hostName: String)
    case unavailable
}
