import SwiftUI

struct WorkspaceSetupTrustSheet: View {
    @Environment(\.dismiss) private var dismiss
    let prompt: WorkspaceSetupTrustPrompt
    let isBusy: Bool
    let runOnce: () -> Void
    let alwaysTrust: () -> Void
    let skip: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(
                        "This repository's yiru.yaml runs before the workspace starts. Only run it if you trust this repository."
                    )
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Colors.mutedForeground)

                    VStack(alignment: .leading, spacing: 8) {
                        Text(prompt.wasPreviouslyApproved ? "New setup script" : "Setup script")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                        Text(verbatim: prompt.scriptContent)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(Theme.Colors.foreground)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Theme.Colors.selection.opacity(0.45), in: .rect(cornerRadius: 16))

                    VStack(spacing: 0) {
                        action("Run hooks", icon: true, action: runOnce)
                        Divider().padding(.horizontal, 12)
                        action("Always trust and run", icon: true, action: alwaysTrust)
                        Divider().padding(.horizontal, 12)
                        action("Don't run", icon: false, action: skip)
                    }
                    .background(Theme.Colors.content, in: .rect(cornerRadius: 18))
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
        }
        .background(Theme.Colors.background)
        .appSheetPresentation(.page)
        .interactiveDismissDisabled(isBusy)
    }

    private var header: some View {
        HStack(spacing: 16) {
            GlassHeaderButton(
                iconName: .arrowLeft,
                accessibilityLabel: "Back to workspace form",
                isDisabled: isBusy,
                action: { dismiss() }
            )

            Text(
                prompt.wasPreviouslyApproved
                    ? "\(prompt.repoName)'s setup script changed"
                    : "Run setup from \(prompt.repoName)?"
            )
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(Theme.Colors.foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 32)
    }

    private func action(
        _ title: LocalizedStringKey,
        icon: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if icon {
                    YiruIcon(.check, size: 16)
                }
                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.Colors.foreground)
                Spacer()
                if isBusy {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
    }
}
