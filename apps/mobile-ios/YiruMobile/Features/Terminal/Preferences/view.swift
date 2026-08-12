import SwiftUI

struct TerminalSettingsView: View {
    let preferences: TerminalPreferences

    var body: some View {
        List {
            Section {
                Picker(
                    "Text size",
                    selection: Binding(
                        get: { preferences.textSize },
                        set: { preferences.selectTextSize($0) }
                    )
                ) {
                    ForEach(TerminalTextSize.allCases) { size in
                        Text(size.title).tag(size)
                    }
                }
                .pickerStyle(.navigationLink)
            } footer: {
                Text(
                    "Text size changes only this device. The terminal grid is fitted again without changing the desktop font."
                )
            }

            Section("Shortcut Bar") {
                ForEach(preferences.accessoryLayout.orderedKeys) { key in
                    TerminalShortcutPreferenceRow(key: key, preferences: preferences)
                }
                .onMove { preferences.moveKeys(from: $0, to: $1) }

                Button("Reset Defaults", systemImage: "arrow.counterclockwise") {
                    preferences.resetAccessoryLayout()
                }
            }
        }
        .navigationTitle(Text("Terminal Settings"))
        .toolbar {
            EditButton()
        }
    }

}

private struct TerminalShortcutPreferenceRow: View {
    let key: TerminalAccessoryKey
    let preferences: TerminalPreferences

    var body: some View {
        Toggle(isOn: isVisible) {
            HStack(spacing: Theme.Spacing.medium) {
                keycap
                Text(key.accessibilityLabel)
            }
        }
    }

    private var isVisible: Binding<Bool> {
        Binding(
            get: { preferences.accessoryLayout.visibleKeys.contains(key) },
            set: { preferences.setKey(key, isVisible: $0) }
        )
    }

    @ViewBuilder
    private var keycap: some View {
        if let systemImage = key.systemImage {
            Image(systemName: systemImage)
                .frame(width: Theme.Size.minimumHitTarget)
        } else {
            Text(key.title)
                .font(.caption.monospaced().weight(.semibold))
                .frame(minWidth: Theme.Size.minimumHitTarget)
        }
    }
}
