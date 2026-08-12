import SwiftUI

struct TerminalAccessoryBar: View {
    let state: TerminalAccessoryState

    var body: some View {
        GlassEffectContainer(spacing: Theme.Glass.groupSpacing) {
            HStack(spacing: Theme.Glass.groupSpacing) {
                pasteButton
                controlButton
                keyStrip
                dismissButton
            }
        }
        .padding(.horizontal, Theme.Spacing.small)
        .padding(.vertical, Theme.Spacing.extraSmall)
        .frame(height: 60)
    }

    private var pasteButton: some View {
        Button {
            state.paste()
        } label: {
            Image(systemName: "doc.on.clipboard")
                .frame(
                    minWidth: Theme.Size.minimumHitTarget,
                    minHeight: Theme.Size.minimumHitTarget
                )
        }
        .buttonStyle(.glass)
        .disabled(!state.isEnabled)
        .accessibilityLabel("Paste")
    }

    @ViewBuilder
    private var controlButton: some View {
        if state.isControlActive {
            Button("Ctrl") {
                state.toggleControl()
            }
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .buttonStyle(.glassProminent)
            .disabled(!state.isEnabled)
            .accessibilityLabel("Control modifier active")
        } else {
            Button("Ctrl") {
                state.toggleControl()
            }
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .buttonStyle(.glass)
            .disabled(!state.isEnabled)
            .accessibilityLabel("Control modifier")
        }
    }

    private var keyStrip: some View {
        ScrollView(.horizontal) {
            HStack(spacing: Theme.Glass.groupSpacing) {
                ForEach(state.keys) { key in
                    keyButton(key)
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    private var dismissButton: some View {
        Button {
            state.dismiss()
        } label: {
            Image(systemName: "keyboard.chevron.compact.down")
                .frame(
                    minWidth: Theme.Size.minimumHitTarget,
                    minHeight: Theme.Size.minimumHitTarget
                )
        }
        .buttonStyle(.glass)
        .accessibilityLabel("Dismiss keyboard")
    }

    @ViewBuilder
    private func keyButton(_ key: TerminalAccessoryKey) -> some View {
        let button = Button {
            state.send(key)
        } label: {
            Group {
                if let systemImage = key.systemImage {
                    Image(systemName: systemImage)
                } else {
                    Text(key.title)
                        .font(.caption.monospaced().weight(.semibold))
                }
            }
            .frame(
                minWidth: Theme.Size.minimumHitTarget,
                minHeight: Theme.Size.minimumHitTarget
            )
        }
        .buttonStyle(.glass)
        .disabled(!state.isEnabled)
        .accessibilityLabel(key.accessibilityLabel)

        if key.repeatsWhilePressed {
            button.buttonRepeatBehavior(.enabled)
        } else {
            button
        }
    }
}
