import Foundation

nonisolated struct TerminalAccessoryLayout: Equatable, Sendable {
    let orderedKeys: [TerminalAccessoryKey]
    let visibleKeys: Set<TerminalAccessoryKey>

    init(
        orderedKeys: [TerminalAccessoryKey],
        visibleKeys: Set<TerminalAccessoryKey>
    ) {
        var seen: Set<TerminalAccessoryKey> = []
        let knownOrder = orderedKeys.filter { seen.insert($0).inserted }
        self.orderedKeys =
            knownOrder + TerminalAccessoryKey.allCases.filter { seen.insert($0).inserted }
        self.visibleKeys = visibleKeys.intersection(TerminalAccessoryKey.allCases)
    }

    static let standard = TerminalAccessoryLayout(
        orderedKeys: TerminalAccessoryKey.allCases,
        visibleKeys: Set(TerminalAccessoryKey.allCases)
    )

    var visibleOrderedKeys: [TerminalAccessoryKey] {
        orderedKeys.filter(visibleKeys.contains)
    }
}
