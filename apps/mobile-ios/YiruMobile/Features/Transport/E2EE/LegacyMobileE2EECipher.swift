import Foundation
import Sodium

nonisolated struct LegacyMobileE2EECipher: Sendable {
    private let sharedKey: Data

    init(sharedKey: Data) throws {
        guard sharedKey.count == 32 else { throw MobileE2EEError.invalidKeyMaterial }
        self.sharedKey = sharedKey
    }

    func sealText(_ plaintext: String) throws -> String {
        try seal(Data(plaintext.utf8)).base64EncodedString()
    }

    func openText(_ frameBase64: String) throws -> String {
        guard let frame = Data(base64Encoded: frameBase64),
            frame.base64EncodedString() == frameBase64,
            let text = String(data: try open(frame), encoding: .utf8)
        else { throw MobileE2EEError.invalidFrame }
        return text
    }

    func sealBinary(_ plaintext: Data) throws -> Data {
        try seal(plaintext)
    }

    func openBinary(_ frame: Data) throws -> Data {
        try open(frame)
    }

    private func seal(_ plaintext: Data) throws -> Data {
        let nonce = try SodiumKeyExchange.randomBytes(count: 24)
        guard
            let ciphertext = Sodium().secretBox.seal(
                message: Array(plaintext),
                secretKey: Array(sharedKey),
                nonce: Array(nonce)
            )
        else { throw MobileE2EEError.cryptographyFailed }
        return nonce + Data(ciphertext)
    }

    private func open(_ frame: Data) throws -> Data {
        let nonceLength = 24
        guard frame.count >= nonceLength + 16 else { throw MobileE2EEError.invalidFrame }
        guard
            let plaintext = Sodium().secretBox.open(
                authenticatedCipherText: Array(frame.dropFirst(nonceLength)),
                secretKey: Array(sharedKey),
                nonce: Array(frame.prefix(nonceLength))
            )
        else { throw MobileE2EEError.invalidFrame }
        return Data(plaintext)
    }
}

nonisolated enum AuthenticatedRuntimeCipher: Sendable {
    case legacy(LegacyMobileE2EECipher)
    case v2(MobileE2EECipher)

    mutating func sealText(_ plaintext: String) throws -> String {
        switch self {
        case .legacy(let cipher): return try cipher.sealText(plaintext)
        case .v2(var cipher):
            let frame = try cipher.sealText(plaintext)
            self = .v2(cipher)
            return frame
        }
    }

    mutating func openText(_ frame: String) throws -> String {
        switch self {
        case .legacy(let cipher): return try cipher.openText(frame)
        case .v2(var cipher):
            let plaintext = try cipher.openText(frame)
            self = .v2(cipher)
            return plaintext
        }
    }

    mutating func sealBinary(_ plaintext: Data) throws -> Data {
        switch self {
        case .legacy(let cipher): return try cipher.sealBinary(plaintext)
        case .v2(var cipher):
            let frame = try cipher.sealBinary(plaintext)
            self = .v2(cipher)
            return frame
        }
    }

    mutating func openBinary(_ frame: Data) throws -> Data {
        switch self {
        case .legacy(let cipher): return try cipher.openBinary(frame)
        case .v2(var cipher):
            let plaintext = try cipher.openBinary(frame)
            self = .v2(cipher)
            return plaintext
        }
    }
}
