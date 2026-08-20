import SwiftUI

// A single-row affordance for creating a hosted review directly from the Changes tab:
// tapping it runs the create flow (stage/commit/publish as needed, then create). This
// is the ONLY create-PR control shown when no review exists yet — see `SourceBranchCard`,
// which never shows this alongside `HostedReviewChip` at the same time.
struct SourceCreateReviewRow: View {
    @Bindable var model: SourceControlModel
    let entry: SourceHostedReviewEntry

    var body: some View {
        Button {
            Task { await model.runAction(entry.action) }
        } label: {
            HStack(spacing: 8) {
                if entry.isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 20)
                } else {
                    YiruIcon(.gitPullRequest, size: 15)
                        .foregroundStyle(labelColor)
                        .frame(width: 20)
                }
                VStack(alignment: .leading, spacing: 2) {
                    // Why: creating a PR is the one branded primary action in this list, so it
                    // carries `primary` rather than the neutral row color the other git actions
                    // use. It is deliberately the only such use here.
                    Text(verbatim: entry.label)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(labelColor)
                    if let hint = entry.hint {
                        Text(verbatim: hint)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(2)
                    }
                }
                Spacer(minLength: 8)
            }
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(!entry.isEnabled)
        .accessibilityLabel(
            Text(verbatim: entry.hint.map { "\(entry.label). \($0)" } ?? entry.label))
    }

    private var labelColor: Color {
        entry.isEnabled ? Theme.Colors.primary : Theme.Colors.mutedForeground
    }
}

struct SourceBranchCard: View {
    @Bindable var model: SourceControlModel
    // Switches the hub to the Pull Request tab — tapping an existing review's chip below.
    let openPullRequest: () -> Void

    private var snapshot: SourceStatusSnapshot? { model.snapshot }

    var body: some View {
        if let snapshot {
            ContentSurface {
                VStack(alignment: .leading, spacing: 8) {
                    // Why: the branch name is the identifying information on this card —
                    // it used to share its row with a trailing sync label, which is exactly
                    // what forced it to tail-truncate. Giving it the full card width (and
                    // room to wrap to a second line) and moving the sync label to its own
                    // line below means a normal branch name is never cut.
                    HStack(alignment: .top, spacing: 6) {
                        YiruIcon(.gitMerge, size: 15)
                        Text(verbatim: snapshot.branchLabel)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Theme.Colors.foreground)
                            .lineLimit(2)
                    }
                    if let syncLabel {
                        Text(verbatim: syncLabel)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                    HStack(spacing: 12) {
                        // Why: plain `Text("\(count) label")` interpolation goes through
                        // LocalizedStringKey, which silently applies locale thousands grouping
                        // ("1,097"). `verbatim` keeps these counts ungrouped beside the paths
                        // they describe.
                        // Why: "files" (not "changed") so this total never reads as the same
                        // count as the "CHANGES" section header below it — that header counts
                        // only the unstaged subset, this counts unstaged + untracked combined.
                        Text(verbatim: "\(snapshot.changedCount) files")
                        Text(verbatim: "\(snapshot.staged.count) staged")
                        if let count = model.branchComparison?.entries.count, count > 0 {
                            Text(verbatim: "\(count) committed")
                        }
                        if snapshot.unresolvedCount > 0 {
                            Text(verbatim: "\(snapshot.unresolvedCount) conflicts")
                                .foregroundStyle(Theme.Colors.unread)
                        }
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    if let operation = snapshot.conflictOperation {
                        HStack(spacing: 8) {
                            Text(verbatim: operation.rawValue.capitalized)
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.Colors.unread)
                            Button {
                                Task { await model.abortConflict() }
                            } label: {
                                if model.busyAction == "abort-\(operation.rawValue)" {
                                    ProgressView()
                                        .controlSize(.small)
                                } else {
                                    Text("Abort \(operation.rawValue)")
                                        .font(.system(size: 12, weight: .medium))
                                }
                            }
                            .buttonStyle(.glass)
                            .buttonBorderShape(.capsule)
                            .tint(Theme.Colors.attention)
                            .appButtonContext(.inline)
                            .disabled(model.busyAction != nil)
                        }
                    }
                    reviewRow
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            // Why: this card renders as one List row in the Changes tab (and as a plain
            // sibling view in the Commits tab); the modifiers are no-ops outside a List.
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(Theme.Colors.background)
        }
    }

    // Why: exactly one pull-request affordance ever renders here — an existing review's
    // live summary (ready), a direct one-tap create action (creatable/blocked-with-reason),
    // or a loading/unavailable placeholder — never two at once. A ready review always wins
    // even if a stale create-eligibility signal also resolved, since `hostedReviewEntry`
    // itself returns nil once a review already exists.
    @ViewBuilder
    private var reviewRow: some View {
        if let summary = model.hostedReviewChipSummary, case .ready = summary {
            Divider()
            HostedReviewChip(summary: summary, open: openPullRequest)
        } else if let entry = model.hostedReviewEntry {
            Divider()
            SourceCreateReviewRow(model: model, entry: entry)
        } else if let chipSummary = model.hostedReviewChipSummary {
            Divider()
            HostedReviewChip(summary: chipSummary, open: openPullRequest)
        }
    }

    // Why: always spell out "N ahead, M behind" when upstream is known — including 0/0, with
    // no "Up to date" shortcut — and show "No upstream" rather than hiding the label when
    // there is none. A label that disappears reads as a loading state.
    private var syncLabel: String? {
        guard let snapshot, let upstream = snapshot.upstream else { return nil }
        guard upstream.hasUpstream else {
            return String(localized: "No upstream")
        }
        // Why: String(localized:) interpolation formats embedded Ints with locale grouping;
        // %lld keeps these counts as plain digits.
        let template = String(localized: "%lld ahead, %lld behind")
        return String(format: template, upstream.ahead, upstream.behind)
    }
}
