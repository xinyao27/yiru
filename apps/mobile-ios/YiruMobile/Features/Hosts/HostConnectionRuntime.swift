nonisolated protocol HostConnectionRuntime: Sendable {
    func connectionSnapshots(forHostIDs hostIDs: [String]) async -> AsyncStream<
        [String: RuntimeConnectionSnapshot]
    >
    func reconnect(hostID: String) async
}
