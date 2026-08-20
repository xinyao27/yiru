import SwiftUI

struct TerminalListView: View {
    let workspace: WorkspaceSummary
    @State private var model: TerminalListModel
    private let selectTerminal: (TerminalSummary) -> Void

    init(
        host: HostProfile,
        workspace: WorkspaceSummary,
        repository: any TerminalRepository,
        selectTerminal: @escaping (TerminalSummary) -> Void
    ) {
        self.workspace = workspace
        self.selectTerminal = selectTerminal
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
                AppUnavailableState(
                    "Terminals unavailable",
                    iconID: .terminal,
                    description: Text(message)
                ) {
                    Button("Try again") {
                        Task { await model.reconnectAndLoad() }
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
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
            AppUnavailableState(
                "No terminals",
                iconID: .terminal,
                description: Text(
                    "Start a terminal on this workspace, then refresh this screen."
                )
            ) {
                Button("Refresh") {
                    Task { await model.load() }
                }
                .buttonStyle(.glass)
                .appButtonContext(.regular)
            }
        } else {
            List {
                if snapshot.isTruncated {
                    Label(
                        "Showing \(snapshot.terminals.count) of \(snapshot.totalCount) terminals",
                        iconID: .warning
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }

                ForEach(snapshot.terminals) { terminal in
                    Button {
                        selectTerminal(terminal)
                    } label: {
                        TerminalRow(terminal: terminal)
                    }
                    .buttonStyle(.plain)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.Colors.background)
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
            YiruIcon(.terminal, size: 20)
                .foregroundStyle(Theme.Colors.mutedForeground)
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
                iconID: terminal.isConnected ? .pulse : .stop,
                tint: terminal.isConnected ? .green : .secondary
            )

            YiruIcon(.arrowRight, size: 16)
                .foregroundStyle(.tertiary)
        }
        .accessibilityElement(children: .combine)
    }
}
