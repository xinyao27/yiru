import SwiftUI

struct WorkspaceActionsSheet: View {
    let workspace: WorkspaceSummary
    let isBusy: Bool
    let showsAgentHistory: Bool
    let showSourceControl: () -> Void
    let showAgentHistory: () -> Void
    let sleep: () -> Void
    let togglePin: () -> Void
    let remove: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isConfirmingDelete = false

    var body: some View {
        VStack(spacing: 0) {
            header
            Group {
                if isConfirmingDelete {
                    deleteConfirmation
                } else {
                    actionList
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .appSheetPresentation(
            .fixed(.height(isConfirmingDelete ? 250 : showsAgentHistory ? 356 : 308))
        )
        .presentationBackground(Theme.Colors.background)
        .interactiveDismissDisabled(isBusy)
    }

    private var header: some View {
        HStack(spacing: 16) {
            GlassHeaderButton(
                iconName: .x,
                accessibilityLabel: "Close sheet",
                action: { dismiss() }
            )
            Text(
                verbatim: isConfirmingDelete
                    ? String(localized: "Delete Worktree")
                    : workspace.name.isEmpty ? workspace.repoName : workspace.name
            )
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(Theme.Colors.foreground)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 32)
    }

    private var actionList: some View {
        VStack(spacing: 0) {
            if !workspace.branch.isEmpty {
                Text(verbatim: workspace.branch)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 8)
            }
            VStack(spacing: 0) {
                actionButton(
                    title: String(localized: "Source Control"),
                    glyph: .gitMerge,
                    action: showSourceControl
                )
                Divider().padding(.horizontal, 12)
                if showsAgentHistory {
                    actionButton(
                        title: String(localized: "Agent Session History"),
                        glyph: .history,
                        action: showAgentHistory
                    )
                    Divider().padding(.horizontal, 12)
                }
                actionButton(
                    title: String(localized: "Sleep"),
                    glyph: .moon,
                    action: sleep
                )
                Divider().padding(.horizontal, 12)
                actionButton(
                    title: String(localized: workspace.isPinned ? "Unpin" : "Pin"),
                    glyph: .pushPin,
                    action: togglePin
                )
                Divider().padding(.horizontal, 12)
                actionButton(
                    title: String(localized: "Delete"),
                    glyph: .trash,
                    color: Theme.Colors.attention,
                    iconColor: Theme.Colors.attention,
                    action: { isConfirmingDelete = true }
                )
            }
            .background(Theme.Colors.content, in: RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Theme.Colors.rail, lineWidth: 0.5)
            }
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .overlay {
            if isBusy {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme.Colors.content.opacity(0.8))
            }
        }
    }

    private var deleteConfirmation: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(
                "Delete \(workspace.name.isEmpty ? workspace.repoName : workspace.name) (\(workspace.branch))?"
            )
            .font(.system(size: 14))
            .foregroundStyle(Theme.Colors.mutedForeground)
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 8) {
                Button("Cancel") { isConfirmingDelete = false }
                    .buttonStyle(.glass)
                    .frame(maxWidth: .infinity)
                    .appButtonContext(.regular)
                Button("Delete", role: .destructive, action: remove)
                    .buttonStyle(.glassProminent)
                    .tint(Theme.Colors.attention)
                    .frame(maxWidth: .infinity)
                    .appButtonContext(.regular)
            }
        }
        .padding(.top, 8)
        .frame(maxHeight: .infinity, alignment: .top)
    }

    private func actionButton(
        title: String,
        glyph: YiruIconID,
        color: Color = Theme.Colors.foreground,
        iconColor: Color = Theme.Colors.mutedForeground,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                YiruIcon(
                    glyph,
                    size: 16
                )
                .foregroundStyle(iconColor)
                Text(verbatim: title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(color)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: WorkspaceListMetrics.rowMinimumHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
    }
}
