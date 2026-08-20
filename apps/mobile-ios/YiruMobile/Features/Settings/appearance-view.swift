import SwiftUI

struct AppearanceSettingsView: View {
    @State private var isLoaderPickerPresented = false
    let preferences: SettingsPreferences

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SettingsHeading(
                    title: "THEME",
                    detail: "Choose how Yiru looks on this device."
                )
                Picker(
                    "Theme",
                    selection: Binding(
                        get: { preferences.themeMode },
                        set: { preferences.selectTheme($0) }
                    )
                ) {
                    ForEach(AppThemeMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                // Why: this is a full 44pt control. SwiftUI's segmented picker otherwise takes
                // its smaller intrinsic height, which breaks the 44pt control rhythm and pulls
                // every section below it upward.
                .frame(maxWidth: .infinity, minHeight: Theme.Control.largeHeight)
                // Why: SettingsSpacing.headingToContent keeps every settings screen's
                // heading-to-control gap identical across the cluster.
                .padding(.top, SettingsSpacing.headingToContent)

                SettingsHeading(
                    title: "LOADING",
                    detail: "Choose the animation shown while agents are working on this device."
                )
                .padding(.top, SettingsSpacing.betweenSections)

                SettingsSection {
                    Button {
                        isLoaderPickerPresented = true
                    } label: {
                        HStack(spacing: 8) {
                            YiruLoader(size: 20)
                                .frame(width: 20)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Loader")
                                    .font(
                                        .system(
                                            size: Theme.Typography.supporting,
                                            weight: .medium
                                        )
                                    )
                                Text(preferences.loaderStyle.title)
                                    .font(.system(size: Theme.Typography.metadata))
                                    .foregroundStyle(Theme.Colors.mutedForeground)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            YiruIcon(
                                .chevronRight,
                                size: 16
                            )
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .frame(width: 20)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 14)
                        .frame(minHeight: 44)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, SettingsSpacing.headingToContent)
            }
            .padding(.horizontal, 16)
            .padding(.top, 17)
            .padding(.bottom, 24)
        }
        .background(Theme.Colors.background)
        .navigationTitle(Text("Appearance"))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isLoaderPickerPresented) {
            LoaderPickerSheet(preferences: preferences)
        }
    }
}
