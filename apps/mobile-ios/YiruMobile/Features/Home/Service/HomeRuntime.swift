protocol HomeRuntime: Sendable {
    func currentConnectionState() async -> RuntimeConnectionState
}
