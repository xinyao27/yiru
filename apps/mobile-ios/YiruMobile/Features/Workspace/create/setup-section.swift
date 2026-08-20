import SwiftUI

struct WorkspaceSetupSection: View {
    @Bindable var model: WorkspaceCreationModel

    var body: some View {
        if model.isLoadingSetup {
            HStack {
                Spacer()
                ProgressView()
                    .controlSize(.small)
                Spacer()
            }
            .frame(minHeight: 44)
            .padding(.bottom, 12)
        } else if let command = model.setupDetails.command {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Setup script")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                    Spacer()
                    if let source = model.setupDetails.source {
                        Text(source == "yiru.yaml" ? "YIRU.YAML" : "HOOKS")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .padding(.horizontal, 8)
                            .frame(minHeight: 24)
                            .background(Theme.Colors.selection, in: .rect(cornerRadius: 6))
                    }
                }

                VStack(spacing: 8) {
                    if model.setupDetails.runPolicy == .ask {
                        HStack(spacing: 8) {
                            decisionButton("Run", decision: .run)
                            decisionButton("Skip", decision: .skip)
                        }
                    } else {
                        Toggle("Run setup command", isOn: $model.shouldRunSetup)
                            .font(.system(size: 14))
                    }

                    Text(verbatim: command)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Theme.Colors.foreground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Theme.Colors.background, in: .rect(cornerRadius: 12))
                }
                .padding(12)
                .background(Theme.Colors.selection.opacity(0.45), in: .rect(cornerRadius: 16))
            }
            .padding(.bottom, 12)
        }
    }

    private func decisionButton(
        _ title: LocalizedStringKey,
        decision: WorkspaceSetupDecision
    ) -> some View {
        Button {
            model.setupDecisionChoice = decision
        } label: {
            Text(title)
                .font(.system(size: 14))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, minHeight: 32)
        }
        .buttonStyle(.plain)
        .glassEffect(
            model.setupDecisionChoice == decision
                ? .regular.tint(Theme.Colors.selection) : .regular,
            in: .capsule
        )
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .contentShape(.rect)
    }
}
