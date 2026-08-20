import SwiftUI

struct WorkspaceSourceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isSearchFocused: Bool
    @State private var mode = WorkspaceSourceMode.smart
    @State private var gitLabState = WorkspaceGitLabMRState.opened
    @Bindable var model: WorkspaceCreationModel

    var body: some View {
        VStack(spacing: 0) {
            header
            VStack(spacing: 8) {
                searchField
                modeBar
                if mode == .gitlab { gitLabStateBar }
                if let prompt = model.crossRepoPrompt { crossRepoPrompt(prompt) }
                ScrollView {
                    sourceRows
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .padding(.horizontal, 16)
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .background(Theme.Colors.background)
        .appSheetPresentation(.page)
        .task {
            // Why: seed the source drawer from the current repository each time it opens, so a
            // prior folder/name choice cannot leak into a later Git repository selection.
            mode = model.selectedRepo?.kind == .folder ? .text : .smart
            gitLabState = .opened
            try? await Task.sleep(for: .milliseconds(120))
            isSearchFocused = true
        }
        .task(id: searchScope) { await search() }
        .onChange(of: mode) { _, _ in model.resetSourceResults() }
    }

    private var header: some View {
        HStack(spacing: 12) {
            GlassHeaderButton(
                iconName: .arrowLeft,
                accessibilityLabel: "Back to workspace form",
                action: { dismiss() }
            )

            Text("Name or 'Create From'")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button("Done") {
                model.useWorkspaceName(model.name)
                dismiss()
            }
            .font(.system(size: 14, weight: .medium))
            .buttonStyle(.glass)
            .appButtonContext(.inline)
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 24)
    }

    private var searchField: some View {
        TextField("Type a name or search a source", text: $model.name)
            .font(.system(size: 14))
            .foregroundStyle(Theme.Colors.foreground)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($isSearchFocused)
            .padding(.horizontal, 16)
            .frame(minHeight: Theme.Control.largeHeight)
            .glassEffect(.regular.interactive(), in: .capsule)
    }

    private var modeBar: some View {
        WorkspaceSourceModeLayout(spacing: 8) {
            if model.selectedRepo?.kind == .git {
                modeButton(.smart, title: "Smart", glyph: .sparkle)
                modeButton(.github, title: "GitHub", glyph: .githubLogo)
                if model.isGitLabAvailable {
                    modeButton(.gitlab, title: "GitLab", glyph: .gitlabLogo)
                }
                modeButton(.branch, title: "Branch", glyph: .gitMerge)
            }
            modeButton(.text, title: "Name", glyph: .textFormat)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func modeButton(
        _ value: WorkspaceSourceMode,
        title: LocalizedStringKey,
        glyph: YiruIconID
    ) -> some View {
        Button {
            mode = value
        } label: {
            HStack(spacing: 4) {
                YiruIcon(
                    glyph,
                    size: 14
                )
                Text(title)
                    .font(.system(size: 12))
            }
            .foregroundStyle(
                mode == value ? Theme.Colors.foreground : Theme.Colors.mutedForeground
            )
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .glassEffect(
            mode == value ? .regular.tint(Theme.Colors.selection) : .regular,
            in: .capsule
        )
        .accessibilityAddTraits(mode == value ? .isSelected : [])
    }

    private var gitLabStateBar: some View {
        Picker("Merge request state", selection: $gitLabState) {
            Text("Open").tag(WorkspaceGitLabMRState.opened)
            Text("Merged").tag(WorkspaceGitLabMRState.merged)
            Text("Closed").tag(WorkspaceGitLabMRState.closed)
            Text("All").tag(WorkspaceGitLabMRState.all)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .frame(minHeight: Theme.Size.minimumHitTarget)
    }

    private func crossRepoPrompt(_ prompt: WorkspaceCrossRepoPrompt) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("This item lives in \(prompt.slug.owner)/\(prompt.slug.repo).")
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.mutedForeground)
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                Button("Cancel") { model.dismissCrossRepoPrompt() }
                    .font(.system(size: 12, weight: .medium))
                    .buttonStyle(.glass)
                    .appButtonContext(.inline)
                Button("Switch to \(prompt.repoName)") {
                    Task {
                        if await model.acceptCrossRepoSource() { dismiss() }
                    }
                }
                .font(.system(size: 12, weight: .medium))
                .appProminentGlassButton()
                .appButtonContext(.inline)
            }
        }
        .padding(12)
        .background(Theme.Colors.content, in: .rect(cornerRadius: 18))
    }

    @ViewBuilder
    private var sourceRows: some View {
        if let error = model.sourceError {
            Text(verbatim: error)
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.attention)
                .frame(maxWidth: .infinity, minHeight: 80)
        } else if hasRows {
            LazyVStack(spacing: 0) {
                if mode == .smart, !trimmedName.isEmpty {
                    nameRow
                    rowDivider
                }
                if mode == .branch, shouldOfferBranchCreation {
                    createBranchRow
                    if !model.sourceRefs.isEmpty { rowDivider }
                }
                if mode == .smart || mode == .github || mode == .gitlab {
                    hostedRows
                }
                if mode == .smart || mode == .branch {
                    branchRows
                }
                if model.isSearchingSources || model.isResolvingSource {
                    ProgressView()
                        .controlSize(.small)
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
            }
            .background(Theme.Colors.content, in: .rect(cornerRadius: 18))
        } else if model.isSearchingSources || model.isResolvingSource {
            ProgressView()
                .controlSize(.small)
                .frame(maxWidth: .infinity, minHeight: 80)
        } else {
            Text(emptyHint)
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(maxWidth: .infinity, minHeight: 80, alignment: .leading)
                .padding(.horizontal, 12)
                .background(Theme.Colors.content, in: .rect(cornerRadius: 18))
        }
    }

    private var nameRow: some View {
        sourceRow(
            title: String(localized: "Use \"\(trimmedName)\""),
            subtitle: String(localized: "Name this workspace"),
            glyph: .sparkle
        ) {
            model.useWorkspaceName(trimmedName)
            dismiss()
        }
    }

    private var createBranchRow: some View {
        sourceRow(
            title: String(localized: "Create branch \"\(trimmedName)\""),
            subtitle: String(localized: "New branch"),
            glyph: .gitMerge
        ) {
            model.createBranch(named: trimmedName)
            dismiss()
        }
    }

    @ViewBuilder
    private var hostedRows: some View {
        let sources = visibleHostedSources
        ForEach(Array(sources.enumerated()), id: \.element.id) { index, source in
            sourceRow(
                title: source.title,
                subtitle: source.provider == .github
                    ? String(localized: "PR #") + String(source.number)
                    : String(localized: "MR !") + String(source.number),
                glyph: source.provider == .github ? .githubLogo : .gitlabLogo,
                status: source.state
            ) {
                Task {
                    if await model.selectHostedSource(source) { dismiss() }
                }
            }
            if index < sources.count - 1 || !visibleSourceRefs.isEmpty { rowDivider }
        }
    }

    @ViewBuilder
    private var branchRows: some View {
        let refs = visibleSourceRefs
        ForEach(Array(refs.enumerated()), id: \.element.id) { index, source in
            sourceRow(
                title: source.localBranchName,
                subtitle: source.refName,
                glyph: .gitMerge
            ) {
                model.selectSourceBranch(source)
                dismiss()
            }
            if index < refs.count - 1 { rowDivider }
        }
    }

    private var rowDivider: some View {
        Divider().padding(.horizontal, 12)
    }

    private func sourceRow(
        title: String,
        subtitle: String,
        glyph: YiruIconID,
        status: String? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                YiruIcon(glyph, size: 16)
                    .frame(width: 20)
                VStack(alignment: .leading, spacing: 4) {
                    Text(verbatim: title)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Colors.foreground)
                        .lineLimit(1)
                    Text(verbatim: subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if let status {
                    Text(verbatim: status.capitalized)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.Colors.selection, in: .capsule)
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 56)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(model.isResolvingSource)
    }

    private func search() async {
        switch mode {
        case .smart:
            await model.searchSmartSources(query: model.name, gitLabState: gitLabState)
        case .github:
            await model.searchHostedSources(provider: .github, query: model.name)
        case .gitlab:
            await model.searchHostedSources(
                provider: .gitlab,
                query: model.name,
                gitLabState: gitLabState
            )
        case .branch:
            await model.searchSources(query: model.name)
        case .text:
            break
        }
    }

    private var searchScope: String {
        "\(mode.rawValue):\(gitLabState.rawValue):\(model.selectedRepoID):\(model.name)"
    }

    private var visibleHostedSources: [WorkspaceHostedSource] {
        switch mode {
        case .smart: model.hostedSources
        case .github: model.hostedSources.filter { $0.provider == .github }
        case .gitlab: model.hostedSources.filter { $0.provider == .gitlab }
        case .branch, .text: []
        }
    }

    private var visibleSourceRefs: [WorkspaceSourceRef] {
        mode == .smart || mode == .branch ? model.sourceRefs : []
    }

    private var hasRows: Bool {
        (mode == .smart && !trimmedName.isEmpty)
            || (mode == .branch && shouldOfferBranchCreation)
            || !visibleHostedSources.isEmpty || !visibleSourceRefs.isEmpty
    }

    private var shouldOfferBranchCreation: Bool {
        !trimmedName.isEmpty
            && !model.sourceRefs.contains {
                $0.refName == trimmedName || $0.localBranchName == trimmedName
            }
    }

    private var emptyHint: LocalizedStringKey {
        switch mode {
        case .smart: "Start typing to create a name or find a source."
        case .github: "Start typing to search GitHub pull requests."
        case .gitlab: "Start typing to search GitLab merge requests."
        case .branch: "No matching branches."
        case .text: "No results found."
        }
    }

    private var trimmedName: String {
        model.name.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
