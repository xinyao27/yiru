import Foundation
import Observation

@Observable
@MainActor
final class TerminalPreferences {
    private(set) var textSize: TerminalTextSize
    private(set) var accessoryLayout: TerminalAccessoryLayout

    @ObservationIgnored
    private let store: any TerminalPreferenceStore

    init(store: any TerminalPreferenceStore) {
        let snapshot = store.load()
        textSize = snapshot.textSize
        accessoryLayout = snapshot.accessoryLayout
        self.store = store
    }

    var surfaceConfiguration: TerminalSurfaceConfiguration {
        .standard(
            textScale: textSize.scale,
            accessoryKeys: accessoryLayout.visibleOrderedKeys
        )
    }

    func selectTextSize(_ textSize: TerminalTextSize) {
        guard self.textSize != textSize else { return }
        self.textSize = textSize
        persist()
    }

    func setKey(_ key: TerminalAccessoryKey, isVisible: Bool) {
        var visibleKeys = accessoryLayout.visibleKeys
        if isVisible {
            visibleKeys.insert(key)
        } else {
            visibleKeys.remove(key)
        }
        accessoryLayout = TerminalAccessoryLayout(
            orderedKeys: accessoryLayout.orderedKeys,
            visibleKeys: visibleKeys
        )
        persist()
    }

    func moveKeys(from offsets: IndexSet, to destination: Int) {
        var orderedKeys = accessoryLayout.orderedKeys
        let movingKeys = offsets.sorted().map { orderedKeys[$0] }
        for offset in offsets.sorted(by: >) {
            orderedKeys.remove(at: offset)
        }
        let removedBeforeDestination = offsets.filter { $0 < destination }.count
        orderedKeys.insert(
            contentsOf: movingKeys,
            at: destination - removedBeforeDestination
        )
        accessoryLayout = TerminalAccessoryLayout(
            orderedKeys: orderedKeys,
            visibleKeys: accessoryLayout.visibleKeys
        )
        persist()
    }

    func resetAccessoryLayout() {
        accessoryLayout = .standard
        persist()
    }

    private func persist() {
        store.save(
            TerminalPreferencesSnapshot(
                textSize: textSize,
                accessoryLayout: accessoryLayout
            )
        )
    }
}
