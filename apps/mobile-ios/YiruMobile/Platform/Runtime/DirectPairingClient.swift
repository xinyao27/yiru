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
        guard let url = URL(string: offer.endpoint),
            url.scheme == "ws" || url.scheme == "wss"
        else {
            throw PairingRuntimeError.invalidEndpoint
        }
        let socket = URLSession.shared.webSocketTask(with: url)
        socket.resume()
        defer { socket.cancel(with: .goingAway, reason: nil) }

        let keyPair = try SodiumKeyExchange.makeKeyPair()
        let clientNonce = try SodiumKeyExchange.randomBytes(count: 32)
        let hello = try MobileE2EEHandshake.makeHello(
            publicKey: keyPair.publicKey,
            clientNonce: clientNonce
        )
        let helloData = try JSONEncoder().encode(hello)
        guard let helloText = String(data: helloData, encoding: .utf8) else {
            throw MobileE2EEError.invalidHandshake
        }
        try await socket.send(.string(helloText))

        let readyData = try await receiveTextData(socket)
        let handshake = try MobileE2EEHandshake.validateReady(
            readyData,
            hello: hello,
            pinnedDesktopPublicKey: offer.publicKey
        )
        let sharedSecret = try SodiumKeyExchange.sharedSecret(
            secretKey: keyPair.secretKey,
            desktopPublicKey: offer.publicKey
        )
        let schedule = try MobileE2EEKeySchedule.derive(
            sharedSecret: sharedSecret,
            transcript: handshake.transcript(),
            clientNonce: handshake.clientNonce,
            desktopNonce: handshake.desktopNonce
        )
        var cipher = MobileE2EECipher(schedule: schedule)
        let auth = MobileE2EEAuthFrame(
            type: "e2ee_auth",
            v: MobileE2EEWireContract.version,
            deviceToken: offer.deviceToken,
            transcriptHashB64: schedule.transcriptHash.base64EncodedString()
        )
        let authData = try JSONEncoder().encode(auth)
        guard let authText = String(data: authData, encoding: .utf8) else {
            throw MobileE2EEError.invalidHandshake
        }
        try await socket.send(.string(try cipher.sealText(authText)))

        let responseFrame = try await receiveText(socket)
        let responseText = try cipher.openText(responseFrame)
        try validateAuthentication(responseText, transcriptHash: schedule.transcriptHash)
        return try await hosts.saveAuthenticatedOffer(offer, connectedAt: Date())
    }

    private func receiveText(_ socket: URLSessionWebSocketTask) async throws -> String {
        switch try await socket.receive() {
        case .string(let text):
            return text
        case .data:
            throw PairingRuntimeError.unexpectedMessage
        @unknown default:
            throw PairingRuntimeError.unexpectedMessage
        }
    }

    private func receiveTextData(_ socket: URLSessionWebSocketTask) async throws -> Data {
        Data(try await receiveText(socket).utf8)
    }

    private func validateAuthentication(_ text: String, transcriptHash: Data) throws {
        let data = Data(text.utf8)
        guard let object = try? JSONSerialization.jsonObject(with: data),
            let frame = object as? [String: Any]
        else {
            throw PairingRuntimeError.authenticationFailed
        }
        if frame["type"] as? String == "e2ee_error" {
            throw PairingRuntimeError.authenticationFailed
        }
        let required: Set<String> = ["type", "v", "transcriptHashB64"]
        let optional: Set<String> = ["runtimeId", "capabilities"]
        guard required.isSubset(of: frame.keys),
            Set(frame.keys).isSubset(of: required.union(optional)),
            frame["type"] as? String == "e2ee_authenticated",
            frame["v"] as? Int == MobileE2EEWireContract.version,
            frame["transcriptHashB64"] as? String == transcriptHash.base64EncodedString()
        else {
            throw PairingRuntimeError.authenticationFailed
        }
    }
}

nonisolated private struct MobileE2EEAuthFrame: Encodable {
    let type: String
    let v: Int
    let deviceToken: String
    let transcriptHashB64: String
}
