import Foundation

@MainActor
final class LegacyPinnedWorkspaceStore {
    static let storageKey = "yiru:native-legacy-pins:v1"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func pinnedWorkspaceIDs(hostID: String) -> Set<String> {
        Self.read(defaults: defaults)[hostID].map(Set.init) ?? []
    }

    func save(_ workspaceIDs: Set<String>, hostID: String) {
        var values = Self.read(defaults: defaults)
        if workspaceIDs.isEmpty {
            values.removeValue(forKey: hostID)
        } else {
            values[hostID] = workspaceIDs.sorted()
        }
        Self.write(values, defaults: defaults)
    }

    private static func read(defaults: UserDefaults) -> [String: [String]] {
        guard let data = defaults.data(forKey: storageKey),
            let values = try? JSONDecoder().decode([String: [String]].self, from: data)
        else { return [:] }
        return values.mapValues { ids in Array(Set(ids.filter { !$0.isEmpty })).sorted() }
    }

    private static func write(_ values: [String: [String]], defaults: UserDefaults) {
        guard let data = try? JSONEncoder().encode(values) else { return }
        defaults.set(data, forKey: storageKey)
    }
}
