nonisolated protocol PairingRuntime: Sendable {
    func pair(_ offer: PairingOffer) async throws -> HostProfile
}

nonisolated enum PairingRuntimeError: Error {
    case invalidEndpoint
    case timeout
    case cancelled
    case unexpectedMessage
    case authenticationFailed
}
