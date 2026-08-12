import Foundation

struct PairingCodeDecoder: Sendable {
    private let now: @Sendable () -> Date

    init(now: @escaping @Sendable () -> Date = Date.init) {
        self.now = now
    }

    func decode(_ input: String) throws -> PairingOffer {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw PairingCodeError.invalid }
        let code =
            if trimmed.lowercased().hasPrefix("yiru://") {
                try extractCode(from: trimmed)
            } else {
                trimmed
            }
        return try decodePayload(code)
    }

    func decodeScannedURL(_ input: String) throws -> PairingOffer {
        try decodePayload(extractCode(from: input.trimmingCharacters(in: .whitespacesAndNewlines)))
    }

    private func extractCode(from input: String) throws -> String {
        guard
            let components = URLComponents(string: input),
            components.scheme?.lowercased() == "yiru",
            components.host?.lowercased() == "pair",
            components.path.isEmpty || components.path == "/"
        else {
            throw PairingCodeError.invalid
        }

        if let queryCode = components.queryItems?.first(where: { $0.name == "code" })?.value,
            !queryCode.isEmpty
        {
            return queryCode
        }
        if let fragment = components.fragment, !fragment.isEmpty {
            return fragment
        }
        throw PairingCodeError.invalid
    }

    private func decodePayload(_ code: String) throws -> PairingOffer {
        guard code.wholeMatch(of: /^[A-Za-z0-9_-]+$/) != nil else {
            throw PairingCodeError.invalid
        }
        let remainder = code.count % 4
        guard remainder != 1 else { throw PairingCodeError.invalid }
        let canonical =
            code
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
            .appending(String(repeating: "=", count: remainder == 0 ? 0 : 4 - remainder))
        guard let data = Data(base64Encoded: canonical) else { throw PairingCodeError.invalid }
        try validateJSONShape(data)

        let wire: PairingOfferWire
        do {
            wire = try JSONDecoder().decode(PairingOfferWire.self, from: data)
        } catch {
            throw PairingCodeError.invalid
        }
        return try validate(wire)
    }

    private func validate(_ wire: PairingOfferWire) throws -> PairingOffer {
        guard
            wire.v == MobilePairingWireContract.offerVersion,
            !wire.endpoint.isEmpty,
            !wire.deviceToken.isEmpty,
            !wire.publicKeyB64.isEmpty
        else {
            throw PairingCodeError.invalid
        }
        let publicKey = try decodePublicKey(wire.publicKeyB64, requiresCanonical: wire.relay != nil)
        let relay = try wire.relay.map(validateRelay)
        guard relay == nil || wire.scope != .runtime else { throw PairingCodeError.invalid }
        return PairingOffer(
            endpoint: wire.endpoint,
            deviceToken: wire.deviceToken,
            publicKey: publicKey,
            publicKeyBase64: wire.publicKeyB64,
            scope: wire.scope.map(pairingScope),
            relay: relay
        )
    }

    private func pairingScope(_ scope: PairingScopeWire) -> PairingScope {
        switch scope {
        case .mobile:
            .mobile
        case .runtime:
            .runtime
        }
    }

    private func validateRelay(_ wire: PairingRelayWire) throws -> PairingRelay {
        let currentTime = now()
        let expiry = Date(timeIntervalSince1970: TimeInterval(wire.inviteExpiresAt) / 1_000)
        guard
            wire.v == MobilePairingWireContract.relayVersion,
            wire.e2eeFraming == MobilePairingWireContract.e2eeFraming,
            wire.assignmentEpoch >= 0,
            wire.assignmentEpoch <= 9_007_199_254_740_991,
            wire.relayHostId.wholeMatch(of: /^[A-Za-z0-9_-]{16}$/) != nil,
            wire.inviteToken.wholeMatch(of: /^[A-Za-z0-9_-]{43}$/) != nil,
            expiry > currentTime,
            expiry <= currentTime.addingTimeInterval(10 * 60),
            let directorURL = canonicalHTTPSOrigin(wire.directorUrl),
            let cellURL = canonicalHTTPSOrigin(wire.cellUrl)
        else {
            throw PairingCodeError.invalid
        }
        return PairingRelay(
            directorURL: directorURL,
            cellURL: cellURL,
            assignmentEpoch: wire.assignmentEpoch,
            relayHostID: wire.relayHostId,
            inviteToken: wire.inviteToken,
            inviteExpiresAt: expiry
        )
    }

    private func decodePublicKey(_ value: String, requiresCanonical: Bool) throws -> Data {
        guard let bytes = Data(base64Encoded: value), bytes.count == 32 else {
            throw PairingCodeError.invalid
        }
        if requiresCanonical, bytes.base64EncodedString() != value {
            throw PairingCodeError.invalid
        }
        return bytes
    }

    private func canonicalHTTPSOrigin(_ value: String) -> URL? {
        guard value.lengthOfBytes(using: .utf8) <= 2_048,
            let components = URLComponents(string: value),
            components.scheme == "https",
            components.user == nil,
            components.password == nil,
            components.query == nil,
            components.fragment == nil,
            components.path.isEmpty,
            let host = components.host,
            !host.isEmpty,
            components.port != 443
        else {
            return nil
        }
        var canonical = URLComponents()
        canonical.scheme = "https"
        canonical.host = host
        canonical.port = components.port
        guard canonical.string == value else { return nil }
        return canonical.url
    }

    private func validateJSONShape(_ data: Data) throws {
        guard let object = try? JSONSerialization.jsonObject(with: data),
            let offer = object as? [String: Any]
        else {
            throw PairingCodeError.invalid
        }
        try requireKeys(
            offer,
            required: ["v", "endpoint", "deviceToken", "publicKeyB64"],
            optional: ["scope", "relay"]
        )
        if let relay = offer["relay"] {
            guard let relayObject = relay as? [String: Any] else {
                throw PairingCodeError.invalid
            }
            try requireKeys(
                relayObject,
                required: [
                    "v", "directorUrl", "cellUrl", "assignmentEpoch", "relayHostId",
                    "inviteToken", "inviteExpiresAt", "e2eeFraming",
                ],
                optional: []
            )
        }
    }

    private func requireKeys(
        _ object: [String: Any], required: Set<String>, optional: Set<String>
    ) throws {
        let keys = Set(object.keys)
        guard required.isSubset(of: keys), keys.isSubset(of: required.union(optional)) else {
            throw PairingCodeError.invalid
        }
    }
}

enum PairingCodeError: Error {
    case invalid
}
