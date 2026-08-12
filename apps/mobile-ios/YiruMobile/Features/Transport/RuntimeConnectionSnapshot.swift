import Foundation

nonisolated enum RuntimeConnectionPhase: Equatable, Sendable {
    case idle
    case connecting
    case connected
    case reconnecting
    case unreachable
    case authenticationFailed
}

nonisolated struct RuntimeConnectionSnapshot: Equatable, Sendable {
    let hostID: String
    let hostName: String
    let phase: RuntimeConnectionPhase
    let reconnectAttempt: Int
    let lastConnectedAt: Date?
}
