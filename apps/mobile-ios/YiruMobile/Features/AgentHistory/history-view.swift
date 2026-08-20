import SwiftUI

struct AgentHistoryView: View {
    let workspace: WorkspaceSummary
    let showWorkspaceSession: (WorkspaceSummary) -> Void
    @State private var model: AgentHistoryModel
    private let hostID: String
    private let connectionRuntime: any HostConnectionRuntime

    init(
        host: HostProfile,
        workspace: WorkspaceSummary,
        repository: any AgentHistoryRepository,
        workspaceRepository: any WorkspaceRepository,
        connectionRuntime: any HostConnectionRuntime,
        showWorkspaceSession: @escaping (WorkspaceSummary) -> Void
    ) {
        self.hostID = host.id
        self.connectionRuntime = connectionRuntime
        self.workspace = workspace
        self.showWorkspaceSession = showWorkspaceSession
        _model = State(
            initialValue: AgentHistoryModel(
                hostID: host.id,
                workspace: workspace,
                repository: repository,
                workspaceRepository: workspaceRepository,
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
            case .unsupported:
                stateView(
                    title: "Agent Session History Unavailable",
                    description: "Update Yiru on this host to browse agent session history."
                )
            case .failed:
                stateView(
                    title: "Unable to Load",
                    description: model.failureMessage ?? "Yiru could not load agent sessions.",
                    retry: true
                )
            case .ready:
                historyContent
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.background)
        .navigationTitle("History · \(workspaceLabel)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.load(force: true) }
                } label: {
                    YiruToolbarIcon(.refresh)
                }
                .disabled(model.isRefreshing || !model.isConnected)
                .accessibilityLabel("Refresh agent sessions")
            }
        }
        .task { await model.observe() }
    }

    private var historyContent: some View {
        VStack(spacing: 0) {
            Picker("Agent session scope", selection: scopeBinding) {
                Text("Workspace").tag(AgentHistoryScope.workspace)
                Text("Project").tag(AgentHistoryScope.project)
                Text("All").tag(AgentHistoryScope.all)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 12)
            .padding(.top, 8)

            HStack(spacing: 8) {
                YiruIcon(.search, size: 14)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                TextField("Search sessions, repo:, path:", text: $model.query)
                    .font(.system(size: 14))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                if !model.query.isEmpty {
                    Button {
                        model.query = ""
                    } label: {
                        YiruIcon(.xCircle)
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                    .buttonStyle(.plain)
                    .frame(
                        width: Theme.Size.minimumHitTarget,
                        height: Theme.Size.minimumHitTarget
                    )
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .glassEffect(.regular.interactive(), in: .capsule)
            .padding(.horizontal, 12)
            .padding(.top, 8)

            if !model.snapshot.issues.isEmpty {
                statusBanner(
                    model.snapshot.issues.count == 1
                        ? "1 transcript skipped"
                        : "\(model.snapshot.issues.count) transcripts skipped",
                    color: Theme.Colors.unread
                )
            }
            if let resumeMessage = model.resumeMessage {
                statusBanner(String(localized: resumeMessage), color: Theme.Colors.mutedForeground)
            }

            if model.groups.isEmpty {
                stateView(
                    title: "No agent sessions",
                    description: model.query.isEmpty
                        ? "No past agent sessions in this scope."
                        : "No sessions match your search."
                )
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(model.groups) { group in
                            section(group)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .refreshable { await model.load(force: true) }
            }
        }
    }

    private var scopeBinding: Binding<AgentHistoryScope> {
        Binding(
            get: { model.scope },
            set: { next in Task { await model.selectScope(next) } }
        )
    }

    private func section(_ group: AgentHistoryGroup) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text(verbatim: group.label.uppercased())
                    .lineLimit(1)
                Text(verbatim: "\(group.sessions.count)")
                Spacer()
            }
            .font(.system(size: 12))
            .foregroundStyle(Theme.Colors.mutedForeground)
            .padding(.vertical, 8)

            ForEach(group.sessions) { session in
                AgentHistorySessionRow(
                    session: session,
                    isExpanded: model.expandedSessionID == session.id,
                    showsCurrentWorkspace: model.scope != .workspace,
                    isCurrentWorkspace: isCurrentWorkspace(session),
                    isResuming: model.resumingSessionID == session.id,
                    isResumeDisabled: model.resumingSessionID != nil,
                    toggle: { model.toggle(session) },
                    resume: {
                        Task {
                            if let target = await model.resume(session) {
                                showWorkspaceSession(target)
                            }
                        }
                    }
                )
            }
        }
    }

    private func statusBanner(_ text: String, color: Color) -> some View {
        Text(verbatim: text)
            .font(.system(size: 12))
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
            .background(Theme.Colors.content, in: .rect(cornerRadius: 12))
            .padding(.horizontal, 12)
            .padding(.top, 8)
    }

    private func stateView(
        title: LocalizedStringResource,
        description: LocalizedStringResource,
        retry: Bool = false
    ) -> some View {
        VStack(spacing: 8) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
            Text(description)
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .multilineTextAlignment(.center)
            if retry {
                Button("Retry", iconID: .refresh) {
                    Task { await model.retry() }
                }
                .buttonStyle(.glass)
                .appButtonContext(.regular)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func isCurrentWorkspace(_ session: AgentHistorySession) -> Bool {
        guard let cwd = session.cwd else { return false }
        return AgentHistorySessionFilter.scopePaths(
            scope: .workspace,
            workspace: workspace,
            workspaces: [workspace]
        ).contains { path in
            let base = path.replacingOccurrences(of: "\\", with: "/").lowercased()
            let candidate = cwd.replacingOccurrences(of: "\\", with: "/").lowercased()
            return candidate == base || candidate.hasPrefix("\(base)/")
        }
    }

    private var workspaceLabel: String {
        let current = model.currentWorkspace
        return current.name.isEmpty ? current.repoName : current.name
    }
}
