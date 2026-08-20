import SwiftUI

struct BrowserSettingsView: View {
    @State private var isLinkModePickerPresented = false
    let preferences: SettingsPreferences

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SettingsSpacing.headingToContent) {
                SettingsHeading(
                    title: "LINKS",
                    detail: "Choose where HTTP(S) links tapped in terminal output\nopen."
                )
                SettingsSection {
                    Button {
                        isLinkModePickerPresented = true
                    } label: {
                        HStack(spacing: 8) {
                            YiruIcon(.globe, size: 16)
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                .frame(width: 20)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Open terminal links")
                                    .font(
                                        .system(
                                            size: Theme.Typography.supporting,
                                            weight: .medium
                                        )
                                    )
                                    .foregroundStyle(Theme.Colors.foreground)
                                Text(preferences.terminalLinkOpenMode.title)
                                    .font(.system(size: Theme.Typography.metadata))
                                    .foregroundStyle(Theme.Colors.mutedForeground)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            YiruIcon(.chevronRight, size: 16)
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                .frame(width: 20)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 12)
                        // Why: 21pt title line + 18pt subtitle line + 4pt gap + 12pt vertical
                        // insets. Stated as a minimum so a wrapped subtitle grows the row
                        // instead of clipping.
                        .frame(minHeight: 67)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            // Why: 52/3 — a whole number of physical pixels at 3x, which keeps this heading
            // and the first card on one baseline. A round 17 or 18 lands mid-pixel and the
            // heading visibly shifts against the card edge below it.
            .padding(.top, 17.333)
            .padding(.bottom, 24)
        }
        .background(Theme.Colors.background)
        .navigationTitle(Text("Browser"))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isLinkModePickerPresented) {
            BrowserLinkModePicker(preferences: preferences)
        }
    }
}

private struct BrowserLinkModePicker: View {
    @Environment(\.dismiss) private var dismiss
    let preferences: SettingsPreferences

    var body: some View {
        VStack(spacing: 0) {
            header
            SettingsSection {
                ForEach(Array(TerminalLinkOpenMode.allCases.enumerated()), id: \.element) {
                    index, mode in
                    option(mode)
                    if index < TerminalLinkOpenMode.allCases.count - 1 {
                        SettingsDivider()
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.Colors.background)
        .appSheetPresentation(.fixed(.height(244)))
    }

    private var header: some View {
        HStack(spacing: 16) {
            GlassIconButton(
                iconName: .x,
                accessibilityLabel: "Close link picker",
                context: .large,
                action: { dismiss() }
            )
            Text("Open terminal links")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 20)
    }

    private func option(_ mode: TerminalLinkOpenMode) -> some View {
        Button {
            preferences.selectTerminalLinkMode(mode)
            dismiss()
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(mode.title)
                        .font(
                            .system(
                                size: 14,
                                weight: preferences.terminalLinkOpenMode == mode
                                    ? .semibold : .regular
                            )
                        )
                        .foregroundStyle(Theme.Colors.foreground)
                    Text(mode.detail)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Group {
                    if preferences.terminalLinkOpenMode == mode {
                        YiruIcon(.check, size: 14)
                    }
                }
                .frame(width: 20)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(minHeight: 64)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(mode.title)
        .accessibilityValue(preferences.terminalLinkOpenMode == mode ? "Selected" : "")
        .accessibilityAddTraits(preferences.terminalLinkOpenMode == mode ? .isSelected : [])
    }
}
