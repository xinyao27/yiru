import SwiftUI

struct AccountView: View {
    let host: HostProfile
    @State private var model: AccountModel

    init(
        host: HostProfile,
        hostRepository: (any HostRepository)? = nil,
        repository: any AccountsRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.host = host
        _model = State(
            initialValue: AccountModel(
                hostID: host.id,
                hostRepository: hostRepository,
                repository: repository,
                connectionRuntime: connectionRuntime
            )
        )
    }

    var body: some View {
        // Why: every phase — connecting, loading, failed, loaded — sits inside the same
        // refreshable scroll view, so pull-to-refresh is available even before any snapshot
        // has loaded. A failed first load must not become a dead end.
        ScrollView {
            if !model.isConnected, !hasLoadedSnapshot, !model.hasTerminalFailure {
                accountPlaceholder {
                    ProgressView()
                    Text("Connecting to \(host.name)…")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
            } else {
                switch model.phase {
                case .loading:
                    accountPlaceholder {
                        ProgressView()
                        Text("Loading accounts…")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                case .failed(let message):
                    accountPlaceholder {
                        Text(verbatim: message)
                            .font(.system(size: 12))
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }
                case .loaded(let snapshot):
                    accountSections(snapshot)
                }
            }
        }
        .refreshable { await model.refresh() }
        .background(Theme.Colors.background.ignoresSafeArea())
        .navigationTitle("Accounts · \(host.name)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.refresh() }
                } label: {
                    YiruToolbarIcon(.refresh)
                }
                .disabled(!model.isConnected || model.isRefreshing)
                .accessibilityLabel("Refresh accounts")
            }
        }
        .alert(item: Binding(get: { model.actionFailure }, set: { _ in })) { failure in
            Alert(
                title: Text("Could not switch account"),
                message: Text(verbatim: failure.message),
                dismissButton: .default(Text("OK"), action: model.clearActionFailure)
            )
        }
        .task { await model.observe() }
    }

    private var hasLoadedSnapshot: Bool {
        if case .loaded = model.phase { return true }
        return false
    }

    private func accountSections(_ snapshot: AccountsSnapshot) -> some View {
        LazyVStack(spacing: 20) {
            ForEach(snapshot.sections) { section in
                AccountUsageSection(
                    section: section,
                    now: model.now,
                    busyAccountID: model.busyAccountID,
                    isConnected: model.isConnected,
                    selectAccount: { accountID in
                        Task {
                            await model.selectAccount(
                                provider: section.provider,
                                accountID: accountID
                            )
                        }
                    }
                )
            }
            Text("Add or re-authenticate accounts from desktop Settings → Accounts.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineSpacing(4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
                .padding(.top, 8)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 24)
    }

    private func accountPlaceholder<Content: View>(
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(spacing: 8, content: content)
            .padding(.vertical, 48)
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity, alignment: .top)
    }
}
