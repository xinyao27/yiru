import SwiftUI
import UIKit

struct HostedReviewIdentityCard: View {
    let review: HostedReview
    let details: HostedReviewDetails?
    let isBusy: Bool
    let editTitle: (() -> Void)?
    let setAutoMerge: (Bool) -> Void
    let confirm: (HostedReviewConfirmation) -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        HostedReviewSection {
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Text(review.state.title)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(review.state.color)
                        .padding(.horizontal, 8)
                        .frame(minHeight: 28)
                        .background(review.state.color.opacity(0.1), in: .capsule)
                    // Why: a review number is an identifier, not a quantity — grouping it as
                    // "#1,097" is wrong, and these routinely exceed 999.
                    Text(verbatim: "#\(review.number)")
                        .font(.system(size: 12, weight: .semibold))
                    if let author = details?.author {
                        Text("· \(author)")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                }
                Spacer(minLength: 8)
                // Why: both trailing actions belong to the review as a whole, so they sit as
                // one pair on the identity row. Keeping the edit button in the title row
                // instead put a control with no text baseline into a `.firstTextBaseline`
                // HStack — SwiftUI aligned its bottom edge to the title's first baseline,
                // which pushed it above the title and opened a large dead gap between them.
                if let editTitle {
                    GlassIconButton(
                        iconName: .edit,
                        accessibilityLabel: "Edit pull request title",
                        context: .inline,
                        action: editTitle
                    )
                }
                if let url = review.url {
                    GlassCircleButton(
                        accessibilityLabel: "Open pull request in browser",
                        context: .inline
                    ) {
                        YiruIcon(.externalLink, size: Theme.Control.inlineIcon)
                    } action: {
                        openURL(url)
                    }
                }
            }

            Text(verbatim: details?.title ?? review.title)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let branch = details?.branchName,
                let base = details?.baseRefName ?? review.baseRefName
            {
                HStack(spacing: 6) {
                    branchPill(branch)
                    YiruIcon(.arrowRight, size: 11)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                    branchPill(base)
                }
            }

            if review.provider == .github {
                HostedReviewActions(
                    review: review,
                    isBusy: isBusy,
                    setAutoMerge: setAutoMerge,
                    confirm: confirm
                )
            }
        }
    }

    private func branchPill(_ value: String) -> some View {
        Text(verbatim: value)
            .font(.system(size: 12, design: .monospaced))
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Theme.Colors.selection.opacity(0.65), in: .capsule)
    }
}

private struct HostedReviewActions: View {
    let review: HostedReview
    let isBusy: Bool
    let setAutoMerge: (Bool) -> Void
    let confirm: (HostedReviewConfirmation) -> Void

    var body: some View {
        VStack(spacing: 8) {
            if review.state == .open || review.state == .draft {
                Button {
                    confirm(.merge(review.number))
                } label: {
                    actionLabel("Merge pull request", busy: isBusy)
                        .frame(maxWidth: .infinity)
                }
                .appProminentGlassButton()
                .buttonBorderShape(.capsule)
                .appButtonContext(.large)
                .disabled(isBusy)
            }
            if canShowAutoMerge {
                Toggle(
                    "Auto-merge when ready",
                    isOn: Binding(
                        get: { review.autoMergeEnabled },
                        set: { isEnabled in setAutoMerge(isEnabled) }
                    )
                )
                .font(.system(size: 14))
                .frame(minHeight: 44)
                .disabled(isBusy)
            }
            HStack(spacing: 8) {
                if review.state == .closed {
                    actionButton("Reopen", destructive: false) { confirm(.reopen(review.number)) }
                } else if review.state == .open || review.state == .draft {
                    // Why: closing is reversible — Reopen is the branch directly above — and
                    // Unlink beside it is the more consequential of the two. Destructive red
                    // here marked the recoverable action and left the other one neutral.
                    actionButton("Close", destructive: false) { confirm(.close(review.number)) }
                }
                actionButton("Unlink", destructive: false) { confirm(.unlink(review.number)) }
            }
        }
    }

    private var canShowAutoMerge: Bool {
        guard review.state == .open else { return false }
        if review.autoMergeEnabled { return true }
        if review.mergeable == .conflicting || review.mergeStateStatus == "DIRTY"
            || review.mergeStateStatus == "UNSTABLE"
        {
            return false
        }
        if review.mergeQueueRequired == true { return true }
        guard review.autoMergeAllowed != false else { return false }
        let requiresReview =
            review.reviewDecision == .reviewRequired
            || review.reviewDecision == .changesRequested
        let canMergeImmediately =
            review.mergeStateStatus != "BLOCKED"
            && review.mergeStateStatus != "BEHIND"
            && (review.mergeable == .mergeable || review.mergeStateStatus == "CLEAN")
        return requiresReview || !canMergeImmediately
    }

    private func actionButton(
        _ title: LocalizedStringResource,
        destructive: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: .medium))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.capsule)
        .tint(destructive ? Theme.Colors.attention : nil)
        .appButtonContext(.regular)
        .disabled(isBusy)
    }

    private func actionLabel(_ title: LocalizedStringResource, busy: Bool) -> some View {
        HStack(spacing: 8) {
            if busy {
                ProgressView()
                    .controlSize(.small)
            }
            Text(title).font(.system(size: 14, weight: .semibold))
        }
    }
}

struct HostedReviewConflictCard: View {
    let conflict: HostedReviewConflict
    let isBusy: Bool
    let errorMessage: String?
    let resolve: () -> Void
    @State private var didCopyCommands = false

    var body: some View {
        HostedReviewSection(title: "Conflicts") {
            Text(
                "\(conflict.commitsBehind) commit\(conflict.commitsBehind == 1 ? "" : "s") behind (base commit: \(conflict.baseCommit))"
            )
            .font(.system(size: 12))
            .foregroundStyle(Theme.Colors.mutedForeground)

            if conflict.files.isEmpty {
                Text("This branch has conflicts that must be resolved")
                    .font(.system(size: 12, weight: .semibold))
                Text(
                    conflict.localMergeState == "clean"
                        ? "GitHub reports conflicts, but local Git did not reproduce them. Refresh the PR or push the branch to recalculate mergeability."
                        : "Conflict file details are unavailable"
                )
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.mutedForeground)
                if let commands = conflict.mergeabilityRefreshCommands {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            Text("Run from this worktree")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.Colors.mutedForeground)
                            Spacer()
                            Button(didCopyCommands ? "Copied" : "Copy commands") {
                                UIPasteboard.general.string = commands
                                didCopyCommands = true
                                Task {
                                    try? await Task.sleep(for: .milliseconds(1_500))
                                    didCopyCommands = false
                                }
                            }
                            .buttonStyle(.glass)
                            .appButtonContext(.inline)
                        }
                        Text(verbatim: commands)
                            .font(.system(size: 12, design: .monospaced))
                            .textSelection(.enabled)
                    }
                    .padding(8)
                    .background(Theme.Colors.selection, in: .rect(cornerRadius: 12))
                }
            } else {
                ForEach(conflict.files, id: \.self) { path in
                    HStack(spacing: 8) {
                        YiruIcon(.warning, size: 12)
                            .foregroundStyle(Theme.Colors.attention)
                        Text(verbatim: path)
                            .font(.system(size: 12, design: .monospaced))
                            .lineLimit(1)
                    }
                    .frame(minHeight: 36)
                }
            }
            Button(isBusy ? "Resolving…" : "Resolve conflicts with AI", action: resolve)
                .buttonStyle(.glass)
                .appButtonContext(.regular)
                .disabled(isBusy)
                .frame(maxWidth: .infinity)
            if isBusy {
                ProgressView()
                    .controlSize(.small)
                    .frame(maxWidth: .infinity)
            }
            if let errorMessage {
                Text(verbatim: errorMessage)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Colors.attention)
            }
        }
    }
}

struct HostedReviewTitleSheet: View {
    @State private var value: String
    let isBusy: Bool
    let save: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    init(title: String, isBusy: Bool, save: @escaping (String) -> Void) {
        _value = State(initialValue: title)
        self.isBusy = isBusy
        self.save = save
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $value, axis: .vertical)
            }
            .navigationTitle("Edit Title")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: dismiss.callAsFunction)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save(value.trimmingCharacters(in: .whitespacesAndNewlines)) }
                        .disabled(
                            isBusy || value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .appSheetPresentation(.fixed(.medium))
    }
}
