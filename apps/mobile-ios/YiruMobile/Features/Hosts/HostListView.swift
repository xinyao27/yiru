import SwiftUI

struct HostListView: View {
    @State private var model: HostListModel
    private let selectHost: (HostProfile) -> Void
    private let showPairing: () -> Void

    init(
        repository: any HostRepository,
        connectionRuntime: any HostConnectionRuntime,
        selectHost: @escaping (HostProfile) -> Void,
        showPairing: @escaping () -> Void
    ) {
        _model = State(
            initialValue: HostListModel(
                repository: repository,
                connectionRuntime: connectionRuntime
            )
        )
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
            await model.observe()
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
                    HostRow(host: host, connection: model.connectionSnapshots[host.id])
                }
                .buttonStyle(.plain)
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button("Reconnect", systemImage: "arrow.clockwise") {
                        Task { await model.reconnect(hostID: host.id) }
                    }
                    .tint(Theme.Colors.accent)
                }
            }
            .refreshable {
                await model.load()
            }
        }
    }
}

private struct HostRow: View {
    let host: HostProfile
    let connection: RuntimeConnectionSnapshot?

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

            connectionBadge
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var connectionBadge: some View {
        switch connection?.phase {
        case nil, .idle:
            SemanticBadge("Paired", systemImage: "checkmark.shield.fill", tint: .secondary)
        case .connecting:
            SemanticBadge("Connecting", systemImage: "arrow.clockwise", tint: .blue)
        case .connected:
            SemanticBadge("Connected", systemImage: "checkmark.circle.fill", tint: .green)
        case .reconnecting:
            SemanticBadge("Reconnecting", systemImage: "arrow.clockwise", tint: .orange)
        case .unreachable:
            SemanticBadge("Unavailable", systemImage: "wifi.exclamationmark", tint: .red)
        case .authenticationFailed:
            SemanticBadge("Authentication failed", systemImage: "key.slash.fill", tint: .red)
        }
    }

    private var endpointLabel: String {
        guard let components = URLComponents(string: host.endpoint), let hostname = components.host
        else {
            return String(localized: "Unknown endpoint")
        }
        return components.port.map { "\(hostname):\($0)" } ?? hostname
    }
}
