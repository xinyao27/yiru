import SwiftUI

struct TroubleshootingView: View {
    @State private var model: TroubleshootingModel
    @State private var expandedIssueID: String?
    let showConnectionLog: () -> Void

    init(repository: any HostRepository, showConnectionLog: @escaping () -> Void) {
        _model = State(initialValue: TroubleshootingModel(repository: repository))
        self.showConnectionLog = showConnectionLog
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                // Why: these two actions stay quiet centered rows. Wrapping them in a glass
                // group turns a troubleshooting hint into two oversized pills competing with
                // the content they are meant to support.
                VStack(spacing: 8) {
                    Button {
                        model.start()
                    } label: {
                        HStack(spacing: 8) {
                            if model.isRunning {
                                ProgressView()
                            } else {
                                YiruIcon(.pulse, size: 18)
                            }
                            Text(runTitle)
                        }
                        .font(.system(size: Theme.Typography.supporting))
                        .frame(maxWidth: .infinity, alignment: .center)
                        .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .disabled(model.isRunning)

                    Button(action: showConnectionLog) {
                        Label("View connection log", iconID: .scroll)
                            .font(.system(size: Theme.Typography.supporting))
                            .frame(maxWidth: .infinity, alignment: .center)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.bottom, 16)

                if !model.results.isEmpty {
                    SettingsSection {
                        ForEach(Array(model.results.enumerated()), id: \.element.id) {
                            index, result in
                            if index > 0 { SettingsDivider() }
                            diagnosticRow(result)
                        }
                    }
                    .padding(.bottom, 16)
                }

                Text("COMMON ISSUES")
                    .font(.system(size: 12, weight: .semibold))
                    .tracking(0.4)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .padding(.horizontal, 4)
                    .padding(.top, 8)
                    .padding(.bottom, 8)

                SettingsSection {
                    ForEach(Array(troubleshootingIssues.enumerated()), id: \.element.id) {
                        index, issue in
                        if index > 0 { SettingsDivider() }
                        issueRow(issue)
                    }
                }
                // Why: SwiftUI's font line box runs about 6pt shorter than the label-to-card
                // baseline this section is designed around. Restore it here rather than
                // changing the row rhythm inside the card.
                .padding(.top, 4)
            }
            // Why: state these gaps explicitly rather than relying on stack defaults —
            // SwiftUI's LazyVStack collapses spacing by different rules and shifts the final
            // card when it is left implicit.
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
        .background(Theme.Colors.background)
        .navigationTitle(Text("Troubleshooting"))
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { model.cancelActiveRun() }
    }

    private var runTitle: LocalizedStringKey {
        if model.isRunning {
            "Running…"
        } else if model.hasRun {
            "Run again"
        } else {
            "Run diagnostics"
        }
    }

    private func diagnosticRow(_ result: DiagnosticResult) -> some View {
        HStack(spacing: 8) {
            YiruIcon(statusGlyph(result.status), size: 14)
                .foregroundStyle(statusColor(result.status))
                .frame(width: 20)
            Text(result.label)
                .font(.system(size: 14, weight: .medium))
            Spacer(minLength: 8)
            Text(result.detail)
                .font(.system(size: 12))
                .foregroundStyle(
                    result.status == .fail ? Theme.Colors.attention : Theme.Colors.mutedForeground
                )
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 44)
    }

    private func issueRow(_ issue: TroubleshootingIssue) -> some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(Theme.Motion.stateChange) {
                    expandedIssueID = expandedIssueID == issue.id ? nil : issue.id
                }
            } label: {
                HStack(spacing: 8) {
                    YiruIcon(issue.glyph, size: 16)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(width: 20)
                    Text(issue.title)
                        .font(
                            .system(
                                size: Theme.Typography.supporting,
                                weight: .medium
                            )
                        )
                        .foregroundStyle(Theme.Colors.foreground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    YiruIcon(expandedIssueID == issue.id ? .chevronUp : .chevronDown, size: 16)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(width: 20)
                }
                .padding(.horizontal, 12)
                .frame(minHeight: 45)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if expandedIssueID == issue.id {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(issue.steps.enumerated()), id: \.offset) { _, step in
                        HStack(alignment: .top, spacing: 8) {
                            Text("•")
                            Text(step)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineSpacing(4)
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            }
        }
    }

    private func statusGlyph(_ status: DiagnosticResultStatus) -> YiruIconID {
        switch status {
        case .pass: .checkCircle
        case .fail: .xCircle
        case .warning: .warning
        }
    }

    private func statusColor(_ status: DiagnosticResultStatus) -> Color {
        switch status {
        case .pass: Theme.Colors.success
        case .fail: Theme.Colors.attention
        case .warning: Theme.Colors.mutedForeground
        }
    }
}
