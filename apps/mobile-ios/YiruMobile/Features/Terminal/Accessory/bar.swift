import SwiftUI

struct TerminalAccessoryDock: View {
    let state: TerminalAccessoryState
    let displayMode: TerminalDisplayMode
    let isDisplayModeUpdating: Bool
    var attachment: TerminalImageAttachment? = nil
    let toggleDisplayMode: () -> Void

    var body: some View {
        TerminalAccessoryBar(
            state: state,
            displayMode: displayMode,
            isDisplayModeUpdating: isDisplayModeUpdating,
            attachment: attachment,
            toggleDisplayMode: toggleDisplayMode
        )
        .padding(.horizontal, TerminalChromeMetrics.horizontalInset)
        .padding(.top, TerminalChromeMetrics.dockTopPadding)
    }
}

struct TerminalAccessoryBar: View {
    private static let controlInsertionIndex = 2

    let state: TerminalAccessoryState
    let displayMode: TerminalDisplayMode
    let isDisplayModeUpdating: Bool
    let attachment: TerminalImageAttachment?
    let toggleDisplayMode: () -> Void

    var body: some View {
        GlassEffectContainer(spacing: TerminalChromeMetrics.accessoryGap) {
            HStack(spacing: TerminalChromeMetrics.accessoryGap) {
                TerminalToolsMenu(state: state, attachment: attachment)
                    .frame(
                        width: TerminalChromeMetrics.accessoryHitSize,
                        height: TerminalChromeMetrics.accessoryHitSize
                    )

                ScrollView(.horizontal) {
                    HStack(spacing: TerminalChromeMetrics.accessoryGap) {
                        displayModeButton
                        ForEach(keysBeforeControl) { key in
                            keyButton(key)
                        }
                        controlButton
                        ForEach(keysAfterControl) { key in
                            keyButton(key)
                        }
                        ForEach(state.customKeys) { key in
                            customKeyButton(key)
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .scrollEdgeEffectHidden(true, for: [.leading, .trailing])
                .background(.clear)
            }
        }
        .frame(height: TerminalChromeMetrics.accessoryRowHeight)
    }

    private func customKeyButton(_ key: TerminalCustomKey) -> some View {
        Button {
            state.send(key)
        } label: {
            Text(verbatim: key.label)
                .font(.system(size: TerminalChromeMetrics.accessoryText, design: .monospaced))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineLimit(1)
                .frame(minHeight: TerminalChromeMetrics.accessoryVisualSize)
                .padding(.horizontal, 10)
                .glassEffect(.regular.interactive(), in: .capsule)
        }
        .buttonStyle(.plain)
        .frame(minHeight: TerminalChromeMetrics.accessoryHitSize)
        .disabled(!state.isEnabled)
        .accessibilityLabel(Text(verbatim: key.label))
    }

    private var keysBeforeControl: [TerminalAccessoryKey] {
        Array(state.keys.prefix(Self.controlInsertionIndex))
    }

    private var keysAfterControl: [TerminalAccessoryKey] {
        Array(state.keys.dropFirst(Self.controlInsertionIndex))
    }

    private var controlButton: some View {
        Button {
            state.toggleControl()
        } label: {
            YiruIcon(.keyboardControl, size: TerminalChromeMetrics.accessoryControlIcon)
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(
                    width: TerminalChromeMetrics.accessoryVisualSize,
                    height: TerminalChromeMetrics.accessoryVisualSize
                )
                .glassEffect(
                    state.isControlActive
                        ? .regular.tint(Theme.Colors.selection).interactive()
                        : .regular.interactive(),
                    in: .circle
                )
        }
        .buttonStyle(.plain)
        .frame(
            width: TerminalChromeMetrics.accessoryHitSize,
            height: TerminalChromeMetrics.accessoryHitSize
        )
        .disabled(!state.isEnabled)
        .accessibilityLabel(
            state.isControlActive ? "Control modifier active" : "Control modifier"
        )
        .accessibilityAddTraits(state.isControlActive ? .isSelected : [])
    }

    private var displayModeButton: some View {
        Button(action: toggleDisplayMode) {
            YiruIcon(
                displayMode == .auto ? .monitor : .deviceMobile,
                size: TerminalChromeMetrics.accessoryIcon
            )
            .font(.system(size: TerminalChromeMetrics.accessoryIcon))
            .frame(
                width: TerminalChromeMetrics.accessoryVisualSize,
                height: TerminalChromeMetrics.accessoryVisualSize
            )
            .foregroundStyle(Theme.Colors.mutedForeground)
            .glassEffect(.regular.interactive(), in: .circle)
        }
        .buttonStyle(.plain)
        .frame(
            width: TerminalChromeMetrics.accessoryHitSize,
            height: TerminalChromeMetrics.accessoryHitSize
        )
        .disabled(!state.isEnabled || isDisplayModeUpdating)
        .accessibilityLabel(displayMode.toggleTitle)
    }

    @ViewBuilder
    private func keyButton(_ key: TerminalAccessoryKey) -> some View {
        let button = Button {
            state.send(key)
        } label: {
            keyLabel(key)
                .foregroundStyle(Theme.Colors.mutedForeground)
                .fixedSize(horizontal: true, vertical: false)
                .frame(
                    minWidth: key.isCircular
                        ? TerminalChromeMetrics.accessoryVisualSize
                        : TerminalChromeMetrics.accessoryHitSize,
                    minHeight: TerminalChromeMetrics.accessoryVisualSize
                )
                .padding(.horizontal, key.isCircular ? 0 : 10)
                .glassEffect(
                    .regular.interactive(),
                    in: key.isCircular ? AnyShape(Circle()) : AnyShape(Capsule())
                )
        }
        .buttonStyle(.plain)
        .frame(minHeight: TerminalChromeMetrics.accessoryHitSize)
        .disabled(!state.isEnabled)
        .accessibilityLabel(key.accessibilityLabel)

        if key.repeatsWhilePressed {
            button.buttonRepeatBehavior(.enabled)
        } else {
            button
        }
    }

    @ViewBuilder
    private func keyLabel(_ key: TerminalAccessoryKey) -> some View {
        switch key {
        case .tab:
            YiruIcon(.keyboardTab, size: TerminalChromeMetrics.accessoryKeyIcon)
        case .enter:
            YiruIcon(.keyboardEnter, size: TerminalChromeMetrics.accessoryKeyIcon)
        case .shiftTab:
            HStack(spacing: TerminalChromeMetrics.accessoryChordGap) {
                Text("⇧")
                    .font(.system(size: TerminalChromeMetrics.accessoryModifierGlyph))
                YiruIcon(.keyboardTab, size: TerminalChromeMetrics.accessoryIcon)
            }
        case .interrupt, .endOfFile, .clearScreen, .suspend, .reverseSearch, .startOfLine,
            .endOfLine, .deleteWordBackward, .clearLineBeforeCursor:
            if let suffix = key.controlChordSuffix {
                HStack(spacing: TerminalChromeMetrics.accessoryChordGap) {
                    Text("⌃")
                    Text(verbatim: suffix)
                }
                .font(.system(size: TerminalChromeMetrics.accessoryText, design: .monospaced))
            }
        case .escape:
            Text(key.title)
                .font(.system(size: TerminalChromeMetrics.accessoryText, design: .monospaced))
        case .space, .backspace, .delete, .arrowUp, .arrowDown, .arrowLeft, .arrowRight:
            Text(key.title)
                .font(.system(size: TerminalChromeMetrics.accessoryGlyph))
        }
    }
}
