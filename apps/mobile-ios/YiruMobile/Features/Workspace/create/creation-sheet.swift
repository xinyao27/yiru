import SwiftUI

struct WorkspaceCreationSheet: View {
    @Environment(\.dismiss) var dismiss
    @Environment(\.openURL) var openURL
    @State var model: WorkspaceCreationModel
    @State var presentedSheet: WorkspaceCreationPresentation?
    let onCreated: (WorkspaceSummary) -> Void

    init(
        host: HostProfile,
        existingPaths: [String],
        existingBranchesByRepo: [String: [String]] = [:],
        repository: any WorkspaceCreationRepository,
        onCreated: @escaping (WorkspaceSummary) -> Void
    ) {
        _model = State(
            initialValue: WorkspaceCreationModel(
                hostID: host.id,
                existingPaths: existingPaths,
                existingBranchesByRepo: existingBranchesByRepo,
                preferredRepoID: RecentWorkspaceStore().repoID(for: host.id),
                repository: repository
            )
        )
        self.onCreated = onCreated
    }

    var body: some View {
        VStack(spacing: 0) {
            sheetHeader
            Group {
                switch model.phase {
                case .loading:
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .ready:
                    creationForm
                case .failed(let message):
                    AppUnavailableState(
                        "Workspace options unavailable",
                        iconID: .wifiSlash,
                        description: Text(message)
                    ) {
                        Button("Try again") { Task { await model.load() } }
                            .buttonStyle(.glass)
                            .appButtonContext(.regular)
                    }
                }
            }
            .background(Theme.Colors.background)
        }
        .background(Theme.Colors.background)
        .appSheetPresentation(.page)
        .interactiveDismissDisabled(model.isCreating)
        .task { await model.load() }
        .task(id: model.selectedRepoID) {
            guard !model.selectedRepoID.isEmpty else { return }
            await model.loadSelectedRepoConfiguration()
        }
        .sheet(item: trustPromptBinding) { prompt in
            WorkspaceSetupTrustSheet(
                prompt: prompt,
                isBusy: model.isCreating,
                runOnce: { completeTrustAction { await model.approveSetup(alwaysTrust: false) } },
                alwaysTrust: {
                    completeTrustAction { await model.approveSetup(alwaysTrust: true) }
                },
                skip: { completeTrustAction { await model.skipUntrustedSetup() } }
            )
        }
        .sheet(item: $presentedSheet) { presentation in
            switch presentation {
            case .source:
                WorkspaceSourceSheet(model: model)
            case .picker(let picker):
                WorkspaceCreationPickerSheet(picker: picker, model: model)
            }
        }
    }

    var sheetHeader: some View {
        HStack(spacing: 16) {
            GlassHeaderButton(
                iconName: .x,
                accessibilityLabel: "Close sheet",
                isDisabled: model.isCreating,
                action: { dismiss() }
            )

            Text("Create Workspace")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 32)
    }
}
