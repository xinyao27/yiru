import SwiftUI

struct SettingsView: View {
    @State private var cleanupModel: CredentialCleanupModel
    @State private var loadTask: Task<Void, Never>?
    let showAppearance: () -> Void
    let showChat: () -> Void
    let showTerminal: () -> Void
    let showBrowser: () -> Void
    let showNotifications: () -> Void
    let showTroubleshooting: () -> Void
    let showAbout: () -> Void
    let showDesignSystem: () -> Void
    let showsDebugNavigation: Bool

    init(
        credentialCleanupRepository: any CredentialCleanupRepository,
        showAppearance: @escaping () -> Void,
        showChat: @escaping () -> Void,
        showTerminal: @escaping () -> Void,
        showBrowser: @escaping () -> Void,
        showNotifications: @escaping () -> Void,
        showTroubleshooting: @escaping () -> Void,
        showAbout: @escaping () -> Void,
        showDesignSystem: @escaping () -> Void = {},
        showsDebugNavigation: Bool = false
    ) {
        _cleanupModel = State(
            initialValue: CredentialCleanupModel(repository: credentialCleanupRepository)
        )
        _loadTask = State(initialValue: nil)
        self.showAppearance = showAppearance
        self.showChat = showChat
        self.showTerminal = showTerminal
        self.showBrowser = showBrowser
        self.showNotifications = showNotifications
        self.showTroubleshooting = showTroubleshooting
        self.showAbout = showAbout
        self.showDesignSystem = showDesignSystem
        self.showsDebugNavigation = showsDebugNavigation
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                navigationSection
                if cleanupModel.state.needsAttention {
                    credentialCleanupSection
                }
                #if DEBUG
                    if showsDebugNavigation {
                        debugNavigationSection
                    }
                #endif
                externalLinks
            }
            .padding(.horizontal, 16)
            // Why: a 16pt content inset gives the one-pixel separator rules a whole-pixel
            // rounding origin on a 3x display.
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
        .background(Theme.Colors.background)
        .navigationTitle(Text("Settings"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            loadTask?.cancel()
            loadTask = Task { @MainActor in
                await cleanupModel.load()
            }
        }
        .onDisappear {
            loadTask?.cancel()
            loadTask = nil
        }
    }

    private var navigationSection: some View {
        SettingsSection {
            SettingsNavigationRow(title: "Appearance", glyph: .palette, action: showAppearance)
            SettingsDivider(emphasized: true)
            SettingsNavigationRow(title: "Chat UI", glyph: .chat, action: showChat)
            SettingsDivider(emphasized: true)
            SettingsNavigationRow(title: "Terminal", glyph: .terminal, action: showTerminal)
            SettingsDivider(emphasized: true)
            SettingsNavigationRow(title: "Browser", glyph: .globe, action: showBrowser)
            SettingsDivider(emphasized: true)
            SettingsNavigationRow(
                title: "Notifications",
                glyph: .bell,
                action: showNotifications
            )
            SettingsDivider(emphasized: true)
            SettingsNavigationRow(
                title: "Troubleshooting",
                glyph: .wrench,
                action: showTroubleshooting
            )
            SettingsDivider(emphasized: true)
            SettingsNavigationRow(title: "About", glyph: .info, action: showAbout)
        }
    }

    private var credentialCleanupSection: some View {
        SettingsSection {
            HStack(spacing: 8) {
                YiruIcon(.key, size: 16)
                    .foregroundStyle(Theme.Colors.unread)
                    .frame(width: 20)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Pairing credential cleanup")
                        .font(.system(size: 14, weight: .medium))
                    Text(cleanupModel.message)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineSpacing(4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Group {
                    if cleanupModel.isRetrying {
                        ProgressView()
                    } else {
                        Button("Retry") {
                            Task { await cleanupModel.retry() }
                        }
                        .buttonStyle(.glass)
                        .appButtonContext(.inline)
                    }
                }
                .frame(minWidth: 64, minHeight: 32)
            }
            .padding(12)
        }
    }

    private var externalLinks: some View {
        SettingsSection {
            if let privacyURL = URL(string: "https://yiru.ai/privacy") {
                SettingsLinkRow(title: "Privacy Policy", glyph: .shield, destination: privacyURL)
            }
            if let supportURL = URL(string: "https://github.com/xinyao27/yiru/issues") {
                SettingsDivider(emphasized: true)
                SettingsLinkRow(title: "Support", glyph: .lifebuoy, destination: supportURL)
            }
        }
    }

    #if DEBUG
        private var debugNavigationSection: some View {
            SettingsSection {
                SettingsNavigationRow(
                    title: "UI Lab",
                    glyph: .shapes,
                    trailing: "DEV ONLY",
                    action: showDesignSystem
                )
            }
        }
    #endif
}
