import Foundation

actor RuntimeClient: HomeRuntime, WorkspaceRepository {
    private let hosts: any HostRepository
    private let timeout: Duration

    init(hosts: any HostRepository, timeout: Duration = .seconds(25)) {
        self.hosts = hosts
        self.timeout = timeout
    }

    func currentConnectionState() async -> RuntimeConnectionState {
        guard
            let host = try? await hosts.hosts().sorted(by: { $0.lastConnected > $1.lastConnected })
                .first
        else {
            return .unpaired
        }
        return .paired(hostName: host.name)
    }

    func workspaces(for hostID: String) async throws -> WorkspaceSnapshot {
        try await withThrowingTaskGroup(of: WorkspaceSnapshot.self) { group in
            group.addTask { try await self.fetchWorkspaces(for: hostID) }
            group.addTask {
                try await Task.sleep(for: self.timeout)
                throw WorkspaceRepositoryError.timeout
            }
            guard let snapshot = try await group.next() else {
                throw CancellationError()
            }
            group.cancelAll()
            return snapshot
        }
    }

    private func fetchWorkspaces(for hostID: String) async throws -> WorkspaceSnapshot {
        guard let credential = try await hosts.credential(for: hostID) else {
            throw WorkspaceRepositoryError.hostNotFound
        }
        let connection = try await AuthenticatedRuntimeConnection.connect(
            endpoint: credential.profile.endpoint,
            desktopPublicKeyBase64: credential.profile.publicKeyBase64,
            deviceToken: credential.deviceToken
        )
        let peer = RuntimeOrpcPeer(connection: connection)
        do {
            let wire: MobileWorkspaceListWire = try await peer.call(
                path: MobileRuntimeWireContract.worktreeListPath,
                input: MobileWorkspaceListRequestWire(limit: 10_000),
                output: MobileWorkspaceListWire.self
            )
            await peer.close()
            return WorkspaceSnapshot(
                workspaces: wire.worktrees.map(WorkspaceSummary.init(wire:)),
                totalCount: wire.totalCount,
                isTruncated: wire.truncated
            )
        } catch {
            await peer.close()
            throw error
        }
    }
}
