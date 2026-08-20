import SwiftUI

struct LoaderPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let preferences: SettingsPreferences

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(Array(AppLoaderStyle.allCases.enumerated()), id: \.element) {
                        index, style in
                        loaderRow(style)
                        if index < AppLoaderStyle.allCases.count - 1 {
                            SettingsDivider()
                        }
                    }
                }
            }
            .frame(maxHeight: 384)
            .background(Theme.Colors.content)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.Colors.background)
        // Why: the option list scrolls inside one fixed-height drawer, so there is nothing to
        // resize; a drag handle here would imply a gesture that does nothing.
        .appSheetPresentation(.fixed(.height(500)))
    }

    private var header: some View {
        HStack(spacing: 16) {
            GlassIconButton(
                iconName: .x,
                accessibilityLabel: "Close loader picker",
                context: .large,
                action: { dismiss() }
            )
            Text("Loader")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 24)
    }

    private func loaderRow(_ style: AppLoaderStyle) -> some View {
        Button {
            preferences.selectLoader(style)
            dismiss()
        } label: {
            HStack(spacing: 12) {
                YiruLoaderPreview(style: style, size: 20)
                    .frame(width: 24, height: 20)
                Text(style.title)
                    .font(
                        .system(
                            size: 14,
                            weight: preferences.loaderStyle == style ? .semibold : .regular)
                    )
                    .foregroundStyle(Theme.Colors.foreground)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Group {
                    if preferences.loaderStyle == style {
                        YiruIcon(.check, size: 14)
                    }
                }
                .frame(width: 20)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(style.title)
        .accessibilityValue(preferences.loaderStyle == style ? "Selected" : "")
        .accessibilityAddTraits(preferences.loaderStyle == style ? .isSelected : [])
    }
}
