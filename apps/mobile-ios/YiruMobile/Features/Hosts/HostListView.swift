import SwiftUI

struct HostListView: View {
    @State private var model: HostListModel
    private let selectHost: (HostProfile) -> Void
    private let showPairing: () -> Void

    init(
        repository: any HostRepository,
        selectHost: @escaping (HostProfile) -> Void,
        showPairing: @escaping () -> Void
    ) {
        _model = State(initialValue: HostListModel(repository: repository))
        self.selectHost = selectHost
        self.showPairing = showPairing
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                ProgressView("Loading hosts…")
            case .loaded(let hosts):
                hostContent(hosts)
            case .failed(let message):
                ContentUnavailableView {
                    Label("Hosts unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") {
                        Task { await model.load() }
                    }
                    .buttonStyle(.glassProminent)
                }
            }
        }
        .navigationTitle(Text("Hosts"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Pair", systemImage: "plus", action: showPairing)
            }
        }
        .task {
            await model.load()
        }
    }

    @ViewBuilder
    private func hostContent(_ hosts: [HostProfile]) -> some View {
        if hosts.isEmpty {
            ContentUnavailableView {
                Label("No paired hosts", systemImage: "desktopcomputer")
            } description: {
                Text("Scan the QR code from Yiru on your desktop to add a host.")
            } actions: {
                Button("Pair with desktop", systemImage: "qrcode.viewfinder", action: showPairing)
                    .buttonStyle(.glassProminent)
            }
        } else {
            List(hosts, id: \.id) { host in
                Button {
                    selectHost(host)
                } label: {
                    HostRow(host: host)
                }
                .buttonStyle(.plain)
            }
            .refreshable {
                await model.load()
            }
        }
    }
}

private struct HostRow: View {
    let host: HostProfile

    var body: some View {
        HStack(spacing: Theme.Spacing.medium) {
            Image(systemName: "desktopcomputer")
                .font(.title3)
                .foregroundStyle(Theme.Colors.accent)
                .frame(width: Theme.Size.minimumHitTarget, height: Theme.Size.minimumHitTarget)

            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                Text(host.name)
                    .font(.headline)
                Text(endpointLabel)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            SemanticBadge("Paired", systemImage: "checkmark.shield.fill", tint: .green)
        }
        .accessibilityElement(children: .combine)
    }

    private var endpointLabel: String {
        guard let components = URLComponents(string: host.endpoint), let hostname = components.host
        else {
            return String(localized: "Unknown endpoint")
        }
        return components.port.map { "\(hostname):\($0)" } ?? hostname
    }
}
