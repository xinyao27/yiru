import Foundation

nonisolated enum YiruWidgetProvider: String, Codable, CaseIterable, Sendable {
    case claude
    case codex
}

nonisolated struct ProviderWidgetSnapshot: Codable, Sendable {
    let name: String
    let openURL: URL
    let sessionResetsAt: Date?
    let sessionUsedPercent: Double?
    let updatedAt: Date?
    let weeklyResetsAt: Date?
    let weeklyUsedPercent: Double?
}

nonisolated struct TokenWidgetSnapshot: Codable, Sendable {
    let openURL: URL
    let todayTokens: Double
    let todayValueUSD: Double
    let weekTokens: Double
    let weekValueUSD: Double
}

nonisolated struct YiruWidgetSnapshot: Codable, Sendable {
    let providers: [String: ProviderWidgetSnapshot]
    let savedAt: Date
    let tokens: TokenWidgetSnapshot?
}

nonisolated enum YiruWidgetSnapshotStore {
    static let appGroupIdentifier = "group.com.xinyao27.yiru.mobile"
    static let snapshotKey = "yiru:native-widget-snapshot:v1"

    static func load() -> YiruWidgetSnapshot? {
        guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return nil }
        if let data = defaults.data(forKey: snapshotKey),
            let snapshot = try? JSONDecoder().decode(YiruWidgetSnapshot.self, from: data)
        {
            return snapshot
        }

        guard let snapshot = LegacyExpoWidgetSnapshotMigration.makeSnapshot(defaults: defaults),
            let data = try? JSONEncoder().encode(snapshot)
        else { return nil }
        // Why: the Expo widget extension and Native extension share the App Group, but their
        // timeline schemas differ. Persist the converted value once so future reads use one shape.
        defaults.set(data, forKey: snapshotKey)
        return snapshot
    }

    static func save(_ snapshot: YiruWidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults(suiteName: appGroupIdentifier)?.set(data, forKey: snapshotKey)
    }
}

nonisolated enum LegacyExpoWidgetSnapshotMigration {
    private static let providerTimelineNames = ["ProviderUsageWidget", "ClaudeUsageWidget"]
    private static let tokenTimelineName = "TokenUsageWidget"

    static func makeSnapshot(defaults: UserDefaults) -> YiruWidgetSnapshot? {
        let provider = latestProviderEntry(defaults: defaults)
        let tokens = latestTokenEntry(defaults: defaults)
        guard provider != nil || tokens != nil else { return nil }
        return YiruWidgetSnapshot(
            providers: provider.map { providerSnapshots(from: $0) } ?? [:],
            savedAt: [provider?.date, tokens?.date].compactMap { $0 }.max() ?? .now,
            tokens: tokens.map { tokenSnapshot(from: $0) }
        )
    }

    private static func providerSnapshots(from entry: LegacyWidgetEntry)
        -> [String: ProviderWidgetSnapshot]
    {
        Dictionary(
            uniqueKeysWithValues: YiruWidgetProvider.allCases.compactMap { provider in
                guard let value = providerValue(provider, from: entry.props, at: entry.date) else {
                    return nil
                }
                return (provider.rawValue, value)
            })
    }

    private static func providerValue(
        _ provider: YiruWidgetProvider,
        from props: [String: Any],
        at date: Date
    ) -> ProviderWidgetSnapshot? {
        guard let raw = props[provider.rawValue] as? [String: Any] else { return nil }
        let openURL = (raw["openUrl"] as? String).flatMap(URL.init(string:)) ?? fallbackURL
        return ProviderWidgetSnapshot(
            name: raw["name"] as? String ?? (provider == .claude ? "Claude" : "ChatGPT"),
            openURL: openURL,
            sessionResetsAt: nil,
            sessionUsedPercent: number(raw["sessionUsedPercent"]),
            updatedAt: relativeDate(raw["updatedLabel"] as? String, from: date, direction: -1),
            weeklyResetsAt: relativeDate(
                raw["weeklyResetLabel"] as? String,
                from: date,
                direction: 1
            ),
            weeklyUsedPercent: number(raw["weeklyUsedPercent"])
        )
    }

    private static func latestProviderEntry(defaults: UserDefaults) -> LegacyWidgetEntry? {
        providerTimelineNames
            .flatMap { timelineEntries(name: $0, defaults: defaults) }
            .max { $0.date < $1.date }
    }

    private static func latestTokenEntry(defaults: UserDefaults) -> LegacyWidgetEntry? {
        timelineEntries(name: tokenTimelineName, defaults: defaults)
            .max { $0.date < $1.date }
    }

    private static func tokenSnapshot(from entry: LegacyWidgetEntry) -> TokenWidgetSnapshot {
        TokenWidgetSnapshot(
            openURL: url(entry.props["openUrl"]),
            todayTokens: number(entry.props["todayTokens"]) ?? 0,
            todayValueUSD: parseCompactCurrency(entry.props["todayValueLabel"] as? String),
            weekTokens: number(entry.props["weekTokens"]) ?? 0,
            weekValueUSD: parseCompactCurrency(entry.props["weekValueLabel"] as? String)
        )
    }

    private static func timelineEntries(name: String, defaults: UserDefaults) -> [LegacyWidgetEntry]
    {
        guard let values = defaults.array(forKey: "__expo_widgets_\(name)_timeline") else {
            return []
        }
        return values.compactMap { value in
            guard let entry = value as? [String: Any],
                let timestamp = number(entry["timestamp"]),
                let props = entry["props"] as? [String: Any]
            else { return nil }
            return LegacyWidgetEntry(
                date: Date(timeIntervalSince1970: timestamp / 1_000),
                props: props
            )
        }
    }

    private static func relativeDate(
        _ label: String?,
        from date: Date,
        direction: Double
    ) -> Date? {
        guard let label, let seconds = compactDuration(label) else { return nil }
        return date.addingTimeInterval(seconds * direction)
    }

    private static func compactDuration(_ label: String) -> TimeInterval? {
        let normalized = label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard let unit = normalized.last,
            let value = Double(normalized.dropLast()),
            value.isFinite
        else { return nil }
        switch unit {
        case "s": return value
        case "m": return value * 60
        case "h": return value * 60 * 60
        case "d": return value * 24 * 60 * 60
        default: return nil
        }
    }

    private static func number(_ raw: Any?) -> Double? {
        if let value = raw as? Double { return value.isFinite ? value : nil }
        if let value = raw as? NSNumber {
            return value.doubleValue.isFinite ? value.doubleValue : nil
        }
        return nil
    }

    private static func parseCompactCurrency(_ label: String?) -> Double {
        guard let label else { return 0 }
        let normalized =
            label
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        guard let suffix = normalized.last else { return 0 }
        let multiplier: Double
        let numberText: Substring
        switch suffix {
        case "K":
            multiplier = 1_000
            numberText = normalized.dropLast()
        case "M":
            multiplier = 1_000_000
            numberText = normalized.dropLast()
        case "B":
            multiplier = 1_000_000_000
            numberText = normalized.dropLast()
        case "T":
            multiplier = 1_000_000_000_000
            numberText = normalized.dropLast()
        default:
            multiplier = 1
            numberText = Substring(normalized)
        }
        return (Double(numberText) ?? 0) * multiplier
    }

    private static func url(_ raw: Any?) -> URL {
        (raw as? String).flatMap(URL.init(string:)) ?? fallbackURL
    }

    private static let fallbackURL = URL(string: "yiru:///") ?? URL(fileURLWithPath: "/")
}

nonisolated private struct LegacyWidgetEntry: @unchecked Sendable {
    let date: Date
    let props: [String: Any]
}
