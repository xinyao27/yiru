import Foundation

actor DirectPairingClient: PairingRuntime {
    private let hosts: any HostRepository
    private let timeout: Duration

    init(hosts: any HostRepository, timeout: Duration = .seconds(25)) {
        self.hosts = hosts
        self.timeout = timeout
    }

    func pair(_ offer: PairingOffer) async throws -> HostProfile {
        return try await withThrowingTaskGroup(of: HostProfile.self) { group in
            group.addTask { try await self.authenticateAndSave(offer) }
            group.addTask {
                try await Task.sleep(for: self.timeout)
                throw PairingRuntimeError.timeout
            }
            guard let result = try await group.next() else {
                throw PairingRuntimeError.cancelled
            }
            group.cancelAll()
            return result
        }
    }

    private func authenticateAndSave(_ offer: PairingOffer) async throws -> HostProfile {
        let connection: AuthenticatedRuntimeConnection
        do {
            connection = try await AuthenticatedRuntimeConnection.connect(
                endpoint: offer.endpoint,
                desktopPublicKeyBase64: offer.publicKeyBase64,
                deviceToken: offer.deviceToken
            )
        } catch AuthenticatedRuntimeError.invalidEndpoint {
            throw PairingRuntimeError.invalidEndpoint
        } catch AuthenticatedRuntimeError.authenticationFailed {
            throw PairingRuntimeError.authenticationFailed
        }
        await connection.close()
        return try await hosts.saveAuthenticatedOffer(offer, connectedAt: Date())
    }
}
