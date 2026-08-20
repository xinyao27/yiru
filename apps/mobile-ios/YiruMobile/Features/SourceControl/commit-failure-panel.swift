import SwiftUI

struct SourceCommitFailurePanel: View {
    @Bindable var model: SourceControlModel

    var body: some View {
        if let failure = model.commitFailure {
            SourceCommitFailureCard(
                failure: failure,
                isLaunchingFix: model.busyAction == "commit-fix",
                launchError: model.commitFailureLaunchError,
                fix: { Task { await model.launchCommitFailureFix() } }
            )
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(Theme.Colors.background)
        }
    }
}

struct SourceCommitFailureCard: View {
    let failure: SourceCommitFailure
    let isLaunchingFix: Bool
    let launchError: String?
    let fix: () -> Void
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Commit failed")
                        .font(.system(size: 14, weight: .bold))
                    Text(verbatim: failure.summary)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if isLaunchingFix {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 44, height: 44)
                } else {
                    Button("Fix", action: fix)
                        .appProminentGlassButton()
                        .appButtonContext(.inline)
                }
            }
            if failure.hasDetails {
                Button {
                    isExpanded.toggle()
                } label: {
                    HStack(spacing: 4) {
                        YiruIcon(isExpanded ? .arrowDown : .arrowRight, size: 16)
                        Text(isExpanded ? "Hide details" : "Show details")
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                if isExpanded {
                    Text(verbatim: failure.error.trimmingCharacters(in: .whitespacesAndNewlines))
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .textSelection(.enabled)
                }
            }
            if let launchError {
                Text(verbatim: launchError)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Colors.attention)
            }
        }
        .padding(8)
        .background(Theme.Colors.selection.opacity(0.45), in: .rect(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(Theme.Colors.attention.opacity(0.65), lineWidth: 0.5)
        }
    }
}
