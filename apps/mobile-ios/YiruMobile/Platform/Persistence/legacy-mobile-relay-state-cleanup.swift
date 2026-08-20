import Foundation
import Security

@MainActor
enum LegacyMobileRelayStateCleanup {
    private static let nativeMarkerKey = "yiru.native-migration.expo-relay-state.v1"
    private static let legacyCleanupKey = "yiru:migrations:mobile-relay-state-removed:v1"
    private static let legacyHostsKey = "yiru:hosts"
    private static let legacyOverlayKey = "yiru:mobile-relay:host-overlays:v2"
    private static let legacyPairingJournalKey = "yiru:mobile-relay:pairing-journal:v1"
    private static let legacyPendingCleanupKey = "yiru:pending-host-credential-cleanups"
    private static let legacyPairingJournalSecretKey = "yiru.mobile-relay.pairing-journal.v1"

    static func perform(defaults: UserDefaults = .standard) {
        guard !defaults.bool(forKey: nativeMarkerKey),
            let storage = LegacyExpoAsyncStorage.load()
        else { return }
        guard storage.isComplete else {
            // Why: deleting retired relay secrets from a partial manifest could miss a host
            // whose metadata file has not arrived yet. Retry after the container is complete.
            return
        }

        let legacyMarker = storage.value(forKey: legacyCleanupKey)
        let overlay = storage.value(forKey: legacyOverlayKey)
        let pairingJournal = storage.value(forKey: legacyPairingJournalKey)
        guard !(legacyMarker == "1" && overlay == nil && pairingJournal == nil) else {
            defaults.set(true, forKey: nativeMarkerKey)
            return
        }

        var hostIDs = Set<String>()
        addHostIDs(from: storage.value(forKey: legacyHostsKey), to: &hostIDs, acceptsID: true)
        addHostIDs(from: overlay, to: &hostIDs, acceptsID: false)
        addHostIDs(from: pairingJournal, to: &hostIDs, acceptsID: false)
        addHostIDs(
            from: storage.value(forKey: legacyPendingCleanupKey),
            to: &hostIDs,
            acceptsID: false
        )

        do {
            for hostID in hostIDs {
                try deleteLegacyKeychainValue(
                    key: "yiru.mobile-relay.credentials.\(hostID)"
                )
                try deleteLegacyKeychainValue(
                    key: "yiru.mobile-relay.direct-upgrade.\(hostID)"
                )
            }
            try deleteLegacyKeychainValue(key: legacyPairingJournalSecretKey)
            // Why: the old AsyncStorage files may still be read by a rollback Expo build.
            // Its own cleanup remains idempotent; this marker only prevents Native from
            // repeating harmless Keychain deletes on every launch.
            defaults.set(true, forKey: nativeMarkerKey)
        } catch {
            // Why: a locked Keychain must leave the migration retryable. Do not commit the
            // marker until every retired bearer secret has been removed.
        }
    }

    private static func addHostIDs(
        from raw: String?,
        to hostIDs: inout Set<String>,
        acceptsID: Bool
    ) {
        guard let raw,
            let data = raw.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data)
        else { return }
        collectHostIDs(object, into: &hostIDs, acceptsID: acceptsID)
    }

    private static func collectHostIDs(
        _ object: Any,
        into hostIDs: inout Set<String>,
        acceptsID: Bool
    ) {
        if let values = object as? [Any] {
            for value in values {
                if let hostID = value as? String {
                    insert(hostID, into: &hostIDs)
                } else if let dictionary = value as? [String: Any] {
                    if let hostID = dictionary["hostId"] as? String {
                        insert(hostID, into: &hostIDs)
                    }
                    if acceptsID, let hostID = dictionary["id"] as? String {
                        insert(hostID, into: &hostIDs)
                    }
                }
            }
            return
        }
        guard let dictionary = object as? [String: Any] else { return }
        guard let host = dictionary["host"] as? [String: Any],
            let hostID = host["id"] as? String
        else {
            return
        }
        insert(hostID, into: &hostIDs)
    }

    private static func insert(_ value: String, into hostIDs: inout Set<String>) {
        guard value.wholeMatch(of: /^[A-Za-z0-9._-]+$/) != nil else { return }
        hostIDs.insert(value)
    }

    private static func deleteLegacyKeychainValue(key: String) throws {
        let encodedKey = Data(key.utf8)
        for service in ["app:no-auth", "app:auth", "app"] {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrGeneric as String: encodedKey,
                kSecAttrAccount as String: encodedKey,
            ]
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else {
                throw HostRepositoryError.keychain(status)
            }
        }
    }
}
