import SwiftUI

struct TerminalListView: View {
    let workspace: WorkspaceSummary
    @State private var model: TerminalListModel

    init(
        host: HostProfile,
        workspace: WorkspaceSummary,
        repository: any TerminalRepository
    ) {
        self.workspace = workspace
        _model = State(
            initialValue: TerminalListModel(
                hostID: host.id,
                worktreeID: workspace.id,
                repository: repository
            )
        )
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                ProgressView("Loading terminals…")
            case .loaded(let snapshot):
                terminalContent(snapshot)
            case .failed(let message):
                ContentUnavailableView {
                    Label("Terminals unavailable", systemImage: "rectangle.connected.to.line.below")
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
        .navigationTitle(Text(workspace.name))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await model.load()
        }
    }

    @ViewBuilder
    private func terminalContent(_ snapshot: TerminalSnapshot) -> some View {
        if snapshot.terminals.isEmpty {
            ContentUnavailableView {
                Label("No terminals", systemImage: "apple.terminal")
            } description: {
                Text("Start a terminal on this workspace, then refresh this screen.")
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
                        "Showing \(snapshot.terminals.count) of \(snapshot.totalCount) terminals",
                        systemImage: "exclamationmark.triangle"
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }

                ForEach(snapshot.terminals) { terminal in
                    TerminalRow(terminal: terminal)
                }
            }
            .refreshable {
                await model.load()
            }
        }
    }
}

private struct TerminalRow: View {
    let terminal: TerminalSummary

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.medium) {
            Image(systemName: "apple.terminal")
                .font(.title3)
                .foregroundStyle(terminal.isConnected ? Theme.Colors.accent : .secondary)
                .frame(width: Theme.Size.minimumHitTarget, height: Theme.Size.minimumHitTarget)

            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                Text(terminal.displayTitle)
                    .font(.headline)
                    .lineLimit(1)
                if !terminal.preview.isEmpty {
                    Text(terminal.preview.replacingOccurrences(of: "\n", with: " "))
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: Theme.Spacing.small)

            SemanticBadge(
                terminal.isConnected ? "Live" : "Ended",
                systemImage: terminal.isConnected ? "waveform.path" : "stop.circle",
                tint: terminal.isConnected ? .green : .secondary
            )
        }
        .accessibilityElement(children: .combine)
    }
}
