import Foundation
import Security

actor KeychainHostRepository: HostRepository {
    private let defaults = UserDefaults.standard
    private let metadataKey = "yiru.hosts.v1"
    private let keychainService = "me.xinyao.yiru.mobile.host-credential"

    func hosts() throws -> [HostProfile] {
        try storedHosts().filter { try hasToken(hostID: $0.id) }
    }

    func credential(for hostID: String) throws -> HostCredential? {
        guard let profile = try storedHosts().first(where: { $0.id == hostID }),
            let token = try readToken(hostID: hostID)
        else {
            return nil
        }
        return HostCredential(profile: profile, deviceToken: token)
    }

    func saveAuthenticatedOffer(_ offer: PairingOffer, connectedAt: Date) throws -> HostProfile {
        var current = try storedHosts()
        let existing = current.first(where: { $0.publicKeyBase64 == offer.publicKeyBase64 })
        let profile = HostProfile(
            id: existing?.id ?? UUID().uuidString.lowercased(),
            name: existing?.name ?? nextHostName(current),
            endpoint: offer.endpoint,
            publicKeyBase64: offer.publicKeyBase64,
            lastConnected: connectedAt
        )

        current.removeAll {
            $0.id == profile.id || $0.publicKeyBase64 == profile.publicKeyBase64
        }
        current.append(profile)
        try writeHosts(current)
        do {
            try writeToken(offer.deviceToken, hostID: profile.id)
        } catch {
            current.removeAll { $0.id == profile.id }
            try? writeHosts(current)
            throw error
        }
        return profile
    }

    private func storedHosts() throws -> [HostProfile] {
        guard let data = defaults.data(forKey: metadataKey) else { return [] }
        do {
            return try JSONDecoder().decode([HostProfile].self, from: data)
        } catch {
            throw HostRepositoryError.metadataUnreadable
        }
    }

    private func writeHosts(_ hosts: [HostProfile]) throws {
        let data: Data
        do {
            data = try JSONEncoder().encode(hosts)
        } catch {
            throw HostRepositoryError.metadataUnreadable
        }
        defaults.set(data, forKey: metadataKey)
    }

    private func nextHostName(_ hosts: [HostProfile]) -> String {
        let largest = hosts.reduce(0) { current, host in
            guard host.name.hasPrefix("Host "),
                let number = Int(host.name.dropFirst("Host ".count))
            else {
                return current
            }
            return max(current, number)
        }
        return "Host \(largest + 1)"
    }

    private func hasToken(hostID: String) throws -> Bool {
        try readToken(hostID: hostID) != nil
    }

    private func readToken(hostID: String) throws -> String? {
        var query = keychainQuery(hostID: hostID)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess,
            let data = result as? Data,
            let token = String(data: data, encoding: .utf8)
        else {
            throw HostRepositoryError.keychain(status)
        }
        return token
    }

    private func writeToken(_ token: String, hostID: String) throws {
        guard let data = token.data(using: .utf8) else {
            throw HostRepositoryError.invalidToken
        }
        let query = keychainQuery(hostID: hostID)
        let update = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw HostRepositoryError.keychain(updateStatus)
        }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw HostRepositoryError.keychain(addStatus)
        }
    }

    private func keychainQuery(hostID: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: hostID,
        ]
    }
}

nonisolated enum HostRepositoryError: Error {
    case metadataUnreadable
    case invalidToken
    case keychain(OSStatus)
}
