import SwiftUI

struct AboutView: View {
    var body: some View {
        VStack(spacing: 0) {
            Text("Open-source agent IDE for 100x builders")
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
                // Why: the navigation stack starts this content higher than the page's own
                // rhythm calls for, so the top offset is stated explicitly.
                .padding(.top, Theme.Spacing.large)
                .padding(.bottom, Theme.Spacing.standard)

            SettingsSection {
                if let websiteURL = URL(string: "https://yiru.ai") {
                    SettingsLinkRow(title: "yiru.ai", glyph: .globe, destination: websiteURL)
                }
                if let repositoryURL = URL(string: "https://github.com/xinyao27/yiru") {
                    SettingsDivider()
                    SettingsLinkRow(
                        title: "xinyao27/yiru",
                        glyph: .githubLogo,
                        destination: repositoryURL
                    )
                }
            }

            Text(versionLabel)
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .padding(.top, Theme.Spacing.standard)

            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.page)
        .background { AppBackground() }
        .navigationTitle(Text("About"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var versionLabel: String {
        let version =
            Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        return "v\(version ?? "?.?.?") (\(build ?? "?"))"
    }
}
