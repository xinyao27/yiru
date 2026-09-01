import CryptoKit
import Foundation
import Security

nonisolated struct NotificationPushCredential: Codable, Sendable {
    let hostID: String
    let keyBase64: String
}

nonisolated enum NotificationPushCredentialStore {
    private static let domain = "yiru-apns-v1"
    private static let service = "com.xinyao27.yiru.mobile.notification-key"

    static func save(deviceToken: String, hostID: String) throws {
        let keyID = keyIdentifier(deviceToken: deviceToken)
        let credential = NotificationPushCredential(
            hostID: hostID,
            keyBase64: notificationKey(deviceToken: deviceToken).base64EncodedString()
        )
        let data = try JSONEncoder().encode(credential)
        let query = try keychainQuery(account: keyID)
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrGeneric as String: Data(hostID.utf8),
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw NotificationPushCredentialError.keychain(updateStatus)
        }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrGeneric as String] = Data(hostID.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw NotificationPushCredentialError.keychain(addStatus)
        }
    }

    static func credential(keyID: String) throws -> NotificationPushCredential? {
        var query = try keychainQuery(account: keyID)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw NotificationPushCredentialError.keychain(status)
        }
        return try JSONDecoder().decode(NotificationPushCredential.self, from: data)
    }

    static func remove(hostID: String) throws {
        var query = try keychainQuery(account: nil)
        query[kSecAttrGeneric as String] = Data(hostID.utf8)
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw NotificationPushCredentialError.keychain(status)
        }
    }

    static func keyIdentifier(deviceToken: String) -> String {
        let digest = SHA256.hash(data: Data("\(domain)/key-id\0\(deviceToken)".utf8))
        return digest.prefix(16).map { String(format: "%02x", $0) }.joined()
    }

    private static func notificationKey(deviceToken: String) -> Data {
        let key = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: Data(deviceToken.utf8)),
            salt: Data("\(domain)/salt".utf8),
            info: Data("notification".utf8),
            outputByteCount: 32
        )
        return key.withUnsafeBytes { Data($0) }
    }

    private static func keychainQuery(account: String?) throws -> [String: Any] {
        guard
            let accessGroup = Bundle.main.object(
                forInfoDictionaryKey: "YiruKeychainAccessGroup"
            ) as? String, !accessGroup.isEmpty
        else {
            throw NotificationPushCredentialError.missingAccessGroup
        }
        var query: [String: Any] = [
            kSecAttrAccessGroup as String: accessGroup,
            kSecAttrService as String: service,
            kSecClass as String: kSecClassGenericPassword,
        ]
        if let account { query[kSecAttrAccount as String] = account }
        return query
    }
}

nonisolated enum NotificationPushCredentialError: Error {
    case keychain(OSStatus)
    case missingAccessGroup
}
