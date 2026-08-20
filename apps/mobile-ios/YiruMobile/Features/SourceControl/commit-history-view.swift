import SwiftUI

struct SourceHistoryView: View {
    @State private var model: SourceHistoryModel
    private let hostID: String
    private let connectionRuntime: any HostConnectionRuntime
    private let refreshRevision: Int

    init(
        hostID: String,
        worktreeID: String,
        repository: any SourceControlRepository,
        connectionRuntime: any HostConnectionRuntime,
        refreshRevision: Int
    ) {
        self.hostID = hostID
        self.connectionRuntime = connectionRuntime
        self.refreshRevision = refreshRevision
        _model = State(
            initialValue: SourceHistoryModel(
                hostID: hostID,
                worktreeID: worktreeID,
                repository: repository,
                connectionRuntime: connectionRuntime
            )
        )
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                ProgressView()
                    .controlSize(.small)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .waiting:
                AppUnavailableState(
                    "History waiting",
                    iconID: .wifiSlash,
                    description: Text("Waiting for desktop…")
                ) {
                    Button("Try again", iconID: .refresh) {
                        Task { await connectionRuntime.reconnect(hostID: hostID) }
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                }
            case .failed(let message):
                VStack(spacing: 12) {
                    Text(verbatim: message)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .multilineTextAlignment(.center)
                    Button("Retry", iconID: .refresh) {
                        Task { await connectionRuntime.reconnect(hostID: hostID) }
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                }
                .padding(16)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .ready where model.commits.isEmpty:
                Text("No commits.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .ready:
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(model.commits) { commit in
                            commitRow(commit)
                        }
                    }
                    .padding(.bottom, 16)
                }
                .refreshable { await model.load() }
            }
        }
        .task(id: refreshRevision) { await model.observe() }
    }

    private func commitRow(_ commit: SourceCommit) -> some View {
        let isExpanded = model.expandedCommitID == commit.id
        return VStack(spacing: 0) {
            Button {
                Task { await model.toggle(commit) }
            } label: {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(verbatim: commit.subject)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.Colors.foreground)
                            .lineLimit(1)
                        Text(verbatim: commitMetadata(commit))
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    YiruIcon(isExpanded ? .chevronDown : .chevronRight, size: 14)
                        .frame(width: 20)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if isExpanded { expandedFiles(commit) }
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.Colors.rail.opacity(0.45)).frame(height: 0.5)
        }
    }

    @ViewBuilder
    private func expandedFiles(_ commit: SourceCommit) -> some View {
        if model.loadingCommitID == commit.id || model.filesByCommit[commit.id] == nil {
            ProgressView()
                .controlSize(.small)
                .padding(.bottom, 8)
        } else if model.filesByCommit[commit.id]?.isEmpty == true {
            Text("No file changes")
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
        } else {
            VStack(spacing: 4) {
                ForEach(model.filesByCommit[commit.id] ?? []) { file in
                    HStack(spacing: 8) {
                        Text(verbatim: file.path)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        lineCounts(file)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
    }

    private func lineCounts(_ file: SourceCommitFile) -> some View {
        HStack(spacing: 0) {
            // Why: `verbatim` avoids the locale thousands grouping that interpolation
            // through LocalizedStringKey would apply to these +/- line counts.
            if let added = file.added, added > 0 {
                Text(verbatim: "+\(added) ")
                    .foregroundStyle(Theme.Colors.gitAdded)
            }
            if let removed = file.removed, removed > 0 {
                Text(verbatim: "-\(removed)")
                    .foregroundStyle(Theme.Colors.gitDeleted)
            }
        }
        .font(.system(size: 12, design: .monospaced))
    }

    private func commitMetadata(_ commit: SourceCommit) -> String {
        [commit.displayID, commit.author, commit.relativeTime(now: Date())]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }
}
