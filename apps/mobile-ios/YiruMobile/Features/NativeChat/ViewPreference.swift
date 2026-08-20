import Foundation

nonisolated enum NativeChatViewPreference {
    static func storedMode(
        hostID: String,
        worktreeID: String,
        tabID: String,
        defaults: UserDefaults = .standard
    ) -> TerminalTabViewMode? {
        guard let data = defaults.data(forKey: key(hostID: hostID, worktreeID: worktreeID)),
            let values = try? JSONDecoder().decode([String: String].self, from: data),
            let raw = values[tabID]
        else { return nil }
        return TerminalTabViewMode(rawValue: raw)
    }

    static func save(
        _ mode: TerminalTabViewMode,
        hostID: String,
        worktreeID: String,
        tabID: String,
        defaults: UserDefaults = .standard
    ) {
        let storageKey = key(hostID: hostID, worktreeID: worktreeID)
        var values: [String: String] = [:]
        if let data = defaults.data(forKey: storageKey),
            let decoded = try? JSONDecoder().decode([String: String].self, from: data)
        {
            values = decoded
        }
        values[tabID] = mode.rawValue
        if let data = try? JSONEncoder().encode(values) { defaults.set(data, forKey: storageKey) }
    }

    private static func key(hostID: String, worktreeID: String) -> String {
        "yiru:nativeChatTabs:\(hostID):\(worktreeID)"
    }
}
