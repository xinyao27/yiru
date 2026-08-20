import SwiftUI

@MainActor
extension WorkspaceCreationSheet {
    var creationForm: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Pick a repository and agent to spin up a new workspace.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .padding(.bottom, 16)

                if model.repos.isEmpty {
                    Text("No repositories found")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                } else {
                    repositoryPicker
                    workspaceNameField
                    agentPicker
                    advancedFields

                    if let message = model.errorMessage {
                        Text(verbatim: message)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Colors.attention)
                            .padding(.top, 8)
                    }

                    HStack {
                        Spacer()
                        if model.isCreating {
                            ProgressView()
                                .frame(width: 44, height: 44)
                        } else {
                            Button("Create Workspace") { create() }
                                .appProminentGlassButton()
                                .appButtonContext(.large)
                                .disabled(!model.canCreate)
                        }
                    }
                    .padding(.top, 16)
                }
            }
            .frame(maxWidth: Theme.Size.readingWidth)
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    var repositoryPicker: some View {
        creationField(title: "Repository") {
            Button {
                presentedSheet = .picker(.repository)
            } label: {
                HStack(spacing: 8) {
                    if let repo = model.selectedRepo {
                        Rectangle()
                            .fill(repoBadgeColor(repo.badgeColor))
                            .frame(width: 8, height: 8)
                    }
                    Text(verbatim: model.selectedRepo?.name ?? "Select a repository")
                        .font(.system(size: 14))
                        .foregroundStyle(
                            model.selectedRepo == nil
                                ? Theme.Colors.mutedForeground : Theme.Colors.foreground
                        )
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    YiruIcon(.chevronDown, size: 14)
                }
                .workspaceCreationControl()
            }
            .buttonStyle(.plain)
            .accessibilityRepresentation {
                Button {
                    presentedSheet = .picker(.repository)
                } label: {
                    Text(verbatim: model.selectedRepo?.name ?? "Select a repository")
                }
            }
        }
    }

    var workspaceNameField: some View {
        creationField(title: workspaceNameLabel, isOptional: true) {
            if let selection = visibleSourceSelection {
                HStack(spacing: 8) {
                    YiruIcon(sourceGlyph(selection), size: 15)
                    Text(verbatim: selection.label)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Colors.foreground)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if let url = sourceURL(selection) {
                        GlassCircleButton(
                            accessibilityLabel: "Open selected source",
                            context: .inline
                        ) {
                            YiruIcon(.externalLink, size: Theme.Control.inlineIcon)
                                .foregroundStyle(Theme.Colors.mutedForeground)
                        } action: {
                            openURL(url)
                        }
                    }
                    GlassCircleButton(
                        accessibilityLabel: "Clear selected source",
                        context: .inline
                    ) {
                        YiruIcon(.x, size: Theme.Control.inlineIcon)
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    } action: {
                        model.clearSourceSelection()
                    }
                }
                .frame(minHeight: 44)
            } else {
                Button {
                    model.clearCreationError()
                    presentedSheet = .source
                } label: {
                    Text(model.name.isEmpty ? "Type a name or search a source" : model.name)
                        .font(.system(size: 14))
                        .foregroundStyle(
                            model.name.isEmpty
                                ? Theme.Colors.mutedForeground : Theme.Colors.foreground
                        )
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .workspaceCreationControl()
                }
                .buttonStyle(.plain)
            }
        }
    }

    var agentPicker: some View {
        creationField(title: "Agent") {
            Button {
                presentedSheet = .picker(.agent)
            } label: {
                HStack(spacing: 8) {
                    WorkspaceAgentIcon(agentID: model.selectedAgentID)
                    Text(verbatim: model.selectedAgent?.label ?? "Blank Terminal")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Colors.foreground)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    YiruIcon(.chevronDown, size: 14)
                }
                .workspaceCreationControl()
            }
            .buttonStyle(.plain)
            .accessibilityRepresentation {
                Button {
                    presentedSheet = .picker(.agent)
                } label: {
                    Text(verbatim: model.selectedAgent?.label ?? "Blank Terminal")
                }
            }
        }
    }

    var advancedFields: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(Theme.Motion.stateChange) {
                    model.isAdvancedExpanded.toggle()
                }
            } label: {
                HStack(spacing: 4) {
                    Text("Advanced")
                        .font(.system(size: 14, weight: .medium))
                    YiruIcon(
                        model.isAdvancedExpanded ? .arrowUp : .arrowDown,
                        size: 14
                    )
                }
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(minHeight: 44)
            }
            .buttonStyle(.plain)

            if model.isAdvancedExpanded {
                if visibleSourceSelection != nil {
                    creationField(title: "Name") {
                        TextField("Workspace name", text: workspaceNameBinding)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .workspaceCreationControl()
                    }
                }
                if shouldShowBranchName {
                    creationField(title: "Branch name") {
                        TextField("Derived from name", text: $model.branchName)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .workspaceCreationControl()
                    }
                }
                if let reusableBranch = model.reuseEligibleBranch {
                    Toggle(isOn: reuseBranchBinding) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Reuse eligible branch")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.Colors.foreground)
                            Text("Branch “\(reusableBranch)”")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                .lineLimit(1)
                        }
                    }
                    .frame(minHeight: 52)
                    .padding(.bottom, 12)
                }
                creationField(title: "Note", isOptional: true) {
                    TextField("Write a note", text: $model.note, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .lineLimit(1...4)
                        .workspaceCreationControl()
                }
                WorkspaceSetupSection(model: model)
            }
        }
    }

    func creationField<Content: View>(
        title: LocalizedStringKey,
        isOptional: Bool = false,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if isOptional {
                Text(
                    "\(Text(title).font(.system(size: 12, weight: .medium))) \(Text("[Optional]").font(.system(size: 12)))"
                )
                .foregroundStyle(Theme.Colors.mutedForeground)
            } else {
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
            content()
        }
        .padding(.bottom, 12)
    }
}
