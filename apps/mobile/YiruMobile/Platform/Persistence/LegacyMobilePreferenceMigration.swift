import Foundation

@MainActor
enum LegacyMobilePreferenceMigration {
    private static let markerKey = "yiru.native-migration.expo-preferences.v1"

    static func perform(defaults: UserDefaults = .standard) {
        let storage = LegacyExpoAsyncStorage.load()
        guard let storage else {
            return
        }

        if !defaults.bool(forKey: markerKey) {
            copyString("yiru:themeMode:v1", from: storage, to: defaults)
            copyString("yiru:loaderStyle", from: storage, to: defaults)
            copyString("yiru:terminalLinkOpenMode", from: storage, to: defaults)
            copyNumber("yiru:hostDockWidth", from: storage, to: defaults)
            copyNumber("yiru:hostSidebarWidth", from: storage, to: defaults)
            copyString("yiru:home-usage-range:v1", from: storage, to: defaults)
            copyString(
                "yiru:contribution-metric:v1",
                toKey: "yiru:activity-metric:v1",
                from: storage,
                to: defaults
            )
            migrateNotificationPreference(from: storage, to: defaults)
            migratePinnedWorkspaces(from: storage, to: defaults)
            migrateTerminalTextSize(from: storage, to: defaults)
            migrateTerminalAccessoryLayout(from: storage, to: defaults)
            migrateCustomShortcuts(from: storage, to: defaults)
            migrateRecentWorkspace(from: storage, to: defaults)
            migrateNotificationWatermarks(from: storage, to: defaults)
            migratePendingCredentialCleanup(from: storage, to: defaults)
            // Why: a valid manifest can temporarily arrive before its file-backed values during
            // an app-container restore. Do not make a partial read permanent; the next launch
            // must be allowed to retry the missing values.
            if storage.isComplete {
                defaults.set(true, forKey: markerKey)
            }
        }
        LegacyHomeSnapshotMigration.perform(from: storage, to: defaults)
    }

    private static func copyString(
        _ sourceKey: String,
        toKey destinationKey: String? = nil,
        from storage: LegacyExpoAsyncStorage,
        to defaults: UserDefaults
    ) {
        let key = destinationKey ?? sourceKey
        guard defaults.object(forKey: key) == nil, let value = storage.value(forKey: sourceKey)
        else { return }
        defaults.set(value, forKey: key)
    }

    private static func copyNumber(
        _ key: String,
        from storage: LegacyExpoAsyncStorage,
        to defaults: UserDefaults
    ) {
        guard defaults.object(forKey: key) == nil,
            let raw = storage.value(forKey: key),
            let value = Double(raw), value.isFinite
        else { return }
        defaults.set(value, forKey: key)
    }

    private static func migrateNotificationPreference(
        from storage: LegacyExpoAsyncStorage,
        to defaults: UserDefaults
    ) {
        let key = "yiru:pushNotificationsEnabled"
        guard defaults.object(forKey: key) == nil, let raw = storage.value(forKey: key) else {
            return
        }
        defaults.set(raw == "true", forKey: key)
    }

    private static func migratePinnedWorkspaces(
        from storage: LegacyExpoAsyncStorage,
        to defaults: UserDefaults
    ) {
        let prefix = "yiru:pins:"
        var values = readPinnedWorkspaces(defaults: defaults)
        for entry in storage.values(withPrefix: prefix) {
            let hostID = String(entry.key.dropFirst(prefix.count))
            guard !hostID.isEmpty,
                let data = entry.value.data(using: .utf8),
                let ids = try? JSONDecoder().decode([String].self, from: data)
            else { continue }
            values[hostID] = Set(values[hostID] ?? []).union(ids.filter { !$0.isEmpty }).sorted()
        }
        guard let data = try? JSONEncoder().encode(values) else { return }
        defaults.set(data, forKey: LegacyPinnedWorkspaceStore.storageKey)
    }

    private static func readPinnedWorkspaces(defaults: UserDefaults) -> [String: [String]] {
        guard let data = defaults.data(forKey: LegacyPinnedWorkspaceStore.storageKey),
            let values = try? JSONDecoder().decode([String: [String]].self, from: data)
        else { return [:] }
        return values
    }

    private static func migrateTerminalTextSize(
        from storage: LegacyExpoAsyncStorage,
        to defaults: UserDefaults
    ) {
        let destinationKey = "terminal.text-size"
        guard defaults.object(forKey: destinationKey) == nil,
            let raw = storage.value(forKey: "yiru:terminalTextScale"),
            let scale = Double(raw),
            let size = TerminalTextSize.allCases.first(where: { $0.scale == scale })
        else { return }
        defaults.set(size.rawValue, forKey: destinationKey)
    }

    private static func migrateTerminalAccessoryLayout(
        from storage: LegacyExpoAsyncStorage,
        to defaults: UserDefaults
    ) {
        guard defaults.object(forKey: "terminal.accessory-order") == nil,
            let raw = storage.value(forKey: "yiru:terminal-accessory-layout"),
            let data = raw.data(using: .utf8),
            let value = try? JSONDecoder().decode(LegacyTerminalAccessoryLayout.self, from: data)
        else { return }

        let known = Set(TerminalAccessoryKey.allCases.map(\.rawValue))
        let ordered = value.orderedBuiltInIds.filter(known.contains)
        let missing = TerminalAccessoryKey.allCases.map(\.rawValue).filter { !ordered.contains($0) }
        let fullOrder = ordered + missing
        let visible = Set(value.visibleBuiltInIds.filter(known.contains))
            .union(missing)
        defaults.set(fullOrder, forKey: "terminal.accessory-order")
        defaults.set(fullOrder.filter(visible.contains), forKey: "terminal.accessory-visible")
    }

    private static func migrateCustomShortcuts(
        from storage: LegacyExpoAsyncStorage,
        to defaults: UserDefaults
    ) {
        let key = "yiru:custom-accessory-keys"
        guard defaults.object(forKey: key) == nil,
            let raw = storage.value(forKey: key),
            let data = raw.data(using: .utf8),
            let objects = try? JSONSerialization.jsonObject(with: data) as? [Any]
        else { return }

        let shortcuts = objects.compactMap { object -> TerminalCustomKey? in
            guard let itemData = try? JSONSerialization.data(withJSONObject: object),
                let legacy = try? JSONDecoder().decode(
                    LegacyTerminalCustomKey.self,
                    from: itemData
                )
            else { return nil }
            return TerminalCustomKey(
                id: legacy.id,
                label: legacy.label,
                bytes: legacy.bytes,
                enter: legacy.enter
            )
        }
        guard objects.isEmpty || !shortcuts.isEmpty,
            let encoded = try? JSONEncoder().encode(shortcuts)
        else { return }
        defaults.set(encoded, forKey: key)
    }

    private static func migrateRecentWorkspace(
        from storage: LegacyExpoAsyncStorage,
        to defaults: UserDefaults
    ) {
        let destinationKey = "yiru:native-last-visited-workspace:v1"
        guard defaults.object(forKey: destinationKey) == nil,
            let raw = storage.value(forKey: "yiru:last-visited-worktree"),
            let data = raw.data(using: .utf8),
            let legacy = try? JSONDecoder().decode(LegacyRecentWorkspace.self, from: data),
            let encoded = try? JSONEncoder().encode(
                RecentWorkspace(hostID: legacy.hostId, workspaceID: legacy.worktreeId, repoID: "")
            )
        else { return }
        defaults.set(encoded, forKey: destinationKey)
    }

    private static func migrateNotificationWatermarks(
        from storage: LegacyExpoAsyncStorage,
        to defaults: UserDefaults
    ) {
        let prefix = "yiru:mobileNotificationsLastSeq:"
        for entry in storage.values(withPrefix: prefix)
        where defaults.object(forKey: entry.key) == nil {
            guard let value = Int64(entry.value), value > 0 else { continue }
            defaults.set(value, forKey: entry.key)
        }
    }

    private static func migratePendingCredentialCleanup(
        from storage: LegacyExpoAsyncStorage,
        to defaults: UserDefaults
    ) {
        guard let raw = storage.value(forKey: "yiru:pending-host-credential-cleanups"),
            let data = raw.data(using: .utf8),
            let values = try? JSONDecoder().decode([String].self, from: data)
        else { return }

        let legacyIDs = Set(values.filter { !$0.isEmpty })
        guard !legacyIDs.isEmpty else { return }

        let nativeKey = "yiru.pending-host-credential-cleanups.v1"
        let currentIDs = Set(defaults.stringArray(forKey: nativeKey) ?? [])
        let mergedIDs = currentIDs.union(legacyIDs).sorted()
        guard mergedIDs != currentIDs.sorted() else { return }
        // Why: a failed legacy keychain delete must remain recoverable after the
        // bundle replacement, otherwise the native Settings screen cannot retry it.
        defaults.set(mergedIDs, forKey: nativeKey)
    }
}

private struct LegacyTerminalAccessoryLayout: Decodable {
    let orderedBuiltInIds: [String]
    let visibleBuiltInIds: [String]
}

private struct LegacyTerminalCustomKey: Decodable {
    let id: String
    let label: String
    let bytes: String
    let enter: Bool

    private enum CodingKeys: String, CodingKey {
        case id
        case label
        case bytes
        case enter
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        label = try container.decode(String.self, forKey: .label)
        bytes = try container.decode(String.self, forKey: .bytes)
        enter = try container.decodeIfPresent(Bool.self, forKey: .enter) ?? false
    }
}

private struct LegacyRecentWorkspace: Decodable {
    let hostId: String
    let worktreeId: String
}
