import SwiftUI

struct SourceControlActionSheet: View {
    @Bindable var model: SourceControlModel
    let branchLabel: String
    let switchBranch: () -> Void
    let openCommits: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text(verbatim: branchLabel)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                    VStack(spacing: 0) {
                        ForEach(Array(model.actions.enumerated()), id: \.element.id) {
                            index, action in
                            if index > 0 { Divider().padding(.leading, 40) }
                            actionRow(action)
                        }
                    }
                    .background(Theme.Colors.content, in: .rect(cornerRadius: 16))
                }
                .padding(16)
            }
            .background(Theme.Colors.background)
            .navigationTitle("Source Control")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(
                    accessibilityLabel: "Close source control actions",
                    action: dismiss.callAsFunction
                )
            }
        }
        .appSheetPresentation(.page)
    }

    private func actionRow(_ action: SourceControlAction) -> some View {
        Button {
            switch action.kind {
            case .switchBranch:
                dismiss()
                switchBranch()
            case .commits:
                dismiss()
                openCommits()
            default:
                Task {
                    await model.runAction(action.kind)
                    if model.busyAction == nil { dismiss() }
                }
            }
        } label: {
            HStack(spacing: 8) {
                YiruIcon(action.iconName, size: 16)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 3) {
                    Text(verbatim: action.label)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(
                            action.isDisabled
                                ? Theme.Colors.mutedForeground : Theme.Colors.foreground
                        )
                    if let hint = action.hint {
                        Text(verbatim: hint)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .multilineTextAlignment(.leading)
                    }
                    if let progress = progress(for: action) {
                        Text(verbatim: progress.message)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                }
                Spacer(minLength: 8)
                if action.isLoading {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(action.isDisabled)
    }

    private func progress(for action: SourceControlAction) -> SourceHostedReviewCreateProgress? {
        switch action.kind {
        case .createReview, .pushAndCreateReview: model.reviewCreateProgress
        default: nil
        }
    }
}
