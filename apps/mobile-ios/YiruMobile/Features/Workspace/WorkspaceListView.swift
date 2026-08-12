import SwiftUI

struct WorkspaceListView: View {
    let host: HostProfile
    @State private var model: WorkspaceListModel
    private let selectWorkspace: (WorkspaceSummary) -> Void

    init(
        host: HostProfile,
        repository: any WorkspaceRepository,
        selectWorkspace: @escaping (WorkspaceSummary) -> Void
    ) {
        self.host = host
        self.selectWorkspace = selectWorkspace
        _model = State(
            initialValue: WorkspaceListModel(hostID: host.id, repository: repository)
        )
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                ProgressView("Loading workspaces…")
            case .loaded(let snapshot):
                workspaceContent(snapshot)
            case .failed(let message):
                ContentUnavailableView {
                    Label("Workspaces unavailable", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") {
                        Task { await model.reconnectAndLoad() }
                    }
                    .buttonStyle(.glassProminent)
                }
            }
        }
        .navigationTitle(Text(host.name))
        .task {
            await model.load()
        }
    }

    @ViewBuilder
    private func workspaceContent(_ snapshot: WorkspaceSnapshot) -> some View {
        if snapshot.workspaces.isEmpty {
            ContentUnavailableView {
                Label("No workspaces", systemImage: "rectangle.stack")
            } description: {
                Text("Create a workspace on this host, then refresh this screen.")
            } actions: {
                Button("Refresh") {
                    Task { await model.load() }
                }
                .buttonStyle(.glassProminent)
            }
        } else {
            List {
                if snapshot.isTruncated {
                    Label(
                        "Showing \(snapshot.workspaces.count) of \(snapshot.totalCount) workspaces",
                        systemImage: "exclamationmark.triangle"
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }

                ForEach(snapshot.workspaces) { workspace in
                    Button {
                        selectWorkspace(workspace)
                    } label: {
                        WorkspaceRow(workspace: workspace)
                    }
                    .buttonStyle(.plain)
                }
            }
            .refreshable {
                await model.load()
            }
        }
    }
}

private struct WorkspaceRow: View {
    let workspace: WorkspaceSummary

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.medium) {
            Image(systemName: activityIcon)
                .foregroundStyle(activityTint)
                .frame(
                    width: Theme.Size.minimumHitTarget,
                    height: Theme.Size.minimumHitTarget
                )

            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                HStack(spacing: Theme.Spacing.small) {
                    Text(workspace.name)
                        .font(.headline)
                        .lineLimit(1)
                    if workspace.isUnread {
                        Circle()
                            .fill(Theme.Colors.accent)
                            .frame(width: 7, height: 7)
                            .accessibilityLabel("Unread activity")
                    }
                }

                Text("\(workspace.repoName) · \(workspace.branch)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                if !workspace.preview.isEmpty {
                    Text(preview)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: Theme.Spacing.small)

            if workspace.isPinned {
                Image(systemName: "pin.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Pinned")
            }

            Image(systemName: "chevron.forward")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .accessibilityElement(children: .combine)
    }

    private var preview: String {
        workspace.preview.replacingOccurrences(of: "\n", with: " ")
    }

    private var activityIcon: String {
        switch workspace.activity {
        case .active: "play.circle.fill"
        case .working: "ellipsis.circle.fill"
        case .permission: "hand.raised.circle.fill"
        case .done: "checkmark.circle.fill"
        case .inactive: "circle"
        }
    }

    private var activityTint: Color {
        switch workspace.activity {
        case .active, .working: Theme.Colors.accent
        case .permission: .orange
        case .done: .green
        case .inactive: .secondary
        }
    }
}
