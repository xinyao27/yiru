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
                    // Why: every Settings toggle shares one track tint, matching Terminal's
                    // shortcut toggles, so the cluster does not mix two switch colors.
                    .tint(Theme.Colors.primary)
                    .padding(.horizontal, 20)
                    .frame(minHeight: 44)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
        .background(Theme.Colors.background)
        .navigationTitle(Text("Chat UI"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
