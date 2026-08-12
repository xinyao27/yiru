actor RuntimeClient: HomeRuntime {
    private var connectionState: RuntimeConnectionState = .unpaired

    func currentConnectionState() -> RuntimeConnectionState {
        connectionState
    }
}
