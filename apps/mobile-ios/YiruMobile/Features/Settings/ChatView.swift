import SwiftUI

struct ChatSettingsView: View {
    let preferences: SettingsPreferences

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SettingsSpacing.headingToContent) {
                SettingsHeading(
                    title: "DEFAULT VIEW",
                    detail:
                        "Choose how supported agent sessions open on this device. Terminal shows the raw CLI; Chat UI shows a chat interface like the desktop app. You can still switch any individual session from its long-press menu."
                )
                SettingsSection {
                    Toggle(
                        "Open sessions in Chat UI",
                        isOn: Binding(
                            get: { preferences.defaultSessionView == .chat },
                            set: {
                                preferences.selectDefaultSessionView($0 ? .chat : .terminal)
                            }
                        )
                    )
                    .font(.system(size: Theme.Typography.primary))
                    .padding(.horizontal, Theme.Spacing.large)
                    .frame(minHeight: Theme.Size.minimumHitTarget)
                }
            }
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.top, Theme.Spacing.standard)
            .padding(.bottom, Theme.Spacing.extraLarge)
        }
        .background { AppBackground() }
        .navigationTitle(Text("Chat UI"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
