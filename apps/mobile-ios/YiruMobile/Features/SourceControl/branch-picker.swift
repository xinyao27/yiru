import SwiftUI

struct SourceBranchPicker: View {
    @Bindable var model: SourceControlModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let branches = model.localBranches {
                    List(branches.branches, id: \.self) { branch in
                        Button {
                            dismiss()
                            Task { await model.checkout(branch) }
                        } label: {
                            HStack(spacing: 12) {
                                YiruIcon(.gitBranch)
                                    .foregroundStyle(Theme.Colors.mutedForeground)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(verbatim: branch)
                                        .foregroundStyle(Theme.Colors.foreground)
                                    if branch == branches.current {
                                        Text("Current branch")
                                            .font(.system(size: 12))
                                            .foregroundStyle(Theme.Colors.mutedForeground)
                                    }
                                }
                                Spacer(minLength: 8)
                                if branch == branches.current {
                                    YiruIcon(.check)
                                        .foregroundStyle(Theme.Colors.mutedForeground)
                                }
                            }
                        }
                        .disabled(branch == branches.current)
                    }
                    .listStyle(.plain)
                    // Why: this drawer paints its own content card. Letting SwiftUI's List
                    // background through puts the iOS grouped tint behind the same rows, so the
                    // sheet stops matching every other selection drawer in the app.
                    .scrollContentBackground(.hidden)
                    .background(Theme.Colors.background)
                } else {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            .navigationTitle("Switch Branch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(
                    accessibilityLabel: "Close branch picker",
                    action: dismiss.callAsFunction
                )
            }
        }
    }
}
