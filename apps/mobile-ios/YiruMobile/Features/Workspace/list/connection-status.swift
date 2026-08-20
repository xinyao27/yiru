import SwiftUI

nonisolated enum WorkspaceHostCompatibility: Equatable, Sendable {
    case compatible
    case mobileTooOld(requiredVersion: Int?)
    case desktopTooOld(requiredVersion: Int?)
}

struct WorkspaceAuthenticationBanner: View {
    let canRetry: Bool
    let retry: () -> Void
    let repair: () -> Void
    let remove: () -> Void

    var body: some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.small) {
                Text(
                    "Authentication failed — try reconnecting first; if it keeps failing, "
                        + "re-pair from desktop."
                )
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.attention)

                GlassActionGroup {
                    if canRetry {
                        actionButton("Retry", action: retry)
                    }
                    actionButton("Re-pair", action: repair)
                    actionButton("Remove", isDestructive: true, action: remove)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.medium)
        .padding(.top, Theme.Spacing.small)
    }

    private func actionButton(
        _ title: LocalizedStringResource,
        isDestructive: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(title, action: action)
            .buttonStyle(.glass)
            .tint(isDestructive ? Theme.Colors.attention : nil)
            .appButtonContext(.inline)
    }
}

struct WorkspaceProtocolBlockView: View {
    let compatibility: WorkspaceHostCompatibility
    let backToHosts: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack {
            ContentSurface {
                VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                    Text(title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.Colors.foreground)
                    Text(bodyText)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                    VStack(spacing: Theme.Spacing.small) {
                        fullWidthButton(primaryActionTitle, isProminent: true) {
                            if let primaryActionURL { openURL(primaryActionURL) }
                        }
                        fullWidthButton("Back to hosts", action: backToHosts)
                    }
                    Text(
                        "Already updated? Go back to Hosts and refresh the connection. If this "
                            + "message stays, remove this host and pair it again."
                    )
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.standard)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.background.ignoresSafeArea())
    }

    private var isMobileTooOld: Bool {
        if case .mobileTooOld = compatibility { return true }
        return false
    }

    private var title: LocalizedStringResource {
        isMobileTooOld ? "Update Yiru Mobile" : "Update Yiru on your computer"
    }

    private var bodyText: LocalizedStringResource {
        if isMobileTooOld {
            return
                "This desktop needs a newer Yiru Mobile app. Install the latest mobile build, then try this host again."
        }
        return
            "This paired desktop app is too old for your current Yiru Mobile app. Update Yiru on your computer, then try this host again."
    }

    private var primaryActionTitle: LocalizedStringResource {
        isMobileTooOld ? "Open TestFlight" : "Open GitHub Releases"
    }

    private var primaryActionURL: URL? {
        if isMobileTooOld {
            return URL(string: "https://testflight.apple.com/join/67PVx1Se")
        }
        return URL(string: "https://github.com/xinyao27/yiru/releases")
    }

    @ViewBuilder
    private func fullWidthButton(
        _ title: LocalizedStringResource,
        isProminent: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        let button = Button(action: action) {
            Text(title)
                .frame(maxWidth: .infinity)
        }
        if isProminent {
            button
                .appProminentGlassButton()
                .appButtonContext(.large)
        } else {
            button
                .buttonStyle(.glass)
                .appButtonContext(.large)
        }
    }
}
