import SwiftUI

struct HomeView: View {
    @State private var model: HomeModel
    private let refreshRevision: Int
    private let showHosts: () -> Void
    private let showPairing: () -> Void
    private let showTerminalPrototype: () -> Void
    private let showDesignSystemCatalog: () -> Void

    init(
        runtime: any HomeRuntime,
        refreshRevision: Int,
        showHosts: @escaping () -> Void,
        showPairing: @escaping () -> Void,
        showTerminalPrototype: @escaping () -> Void,
        showDesignSystemCatalog: @escaping () -> Void
    ) {
        _model = State(initialValue: HomeModel(runtime: runtime))
        self.refreshRevision = refreshRevision
        self.showHosts = showHosts
        self.showPairing = showPairing
        self.showTerminalPrototype = showTerminalPrototype
        self.showDesignSystemCatalog = showDesignSystemCatalog
    }

    var body: some View {
        ZStack {
            AtmosphereBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: Theme.Spacing.large) {
                    introduction
                    connectionContent
                }
                .frame(maxWidth: Theme.Size.readingWidth, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.page)
                .padding(.vertical, Theme.Spacing.extraLarge)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(Text("Yiru"))
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Pair", systemImage: "qrcode.viewfinder", action: showPairing)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button(
                    "Design System", systemImage: "paintpalette", action: showDesignSystemCatalog)
            }
        }
        .task(id: refreshRevision) {
            await model.observe()
        }
        .refreshable {
            await model.refresh()
        }
    }

    private var introduction: some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                Label("Native iOS foundation", systemImage: "swift")
                    .font(.title2.weight(.semibold))

                Text(
                    "The iOS 26 app shell, architecture, and Liquid Glass design system are ready for feature-by-feature migration."
                )
                .foregroundStyle(.secondary)

                #if DEBUG
                    Button(
                        "Terminal prototype",
                        systemImage: "terminal",
                        action: showTerminalPrototype
                    )
                    .buttonStyle(.glass)
                #endif
            }
        }
    }

    @ViewBuilder
    private var connectionContent: some View {
        switch model.phase {
        case .loading:
            ContentSurface {
                HStack(spacing: Theme.Spacing.medium) {
                    ProgressView()
                    Text("Reading connection state…")
                        .foregroundStyle(.secondary)
                }
            }
        case .loaded(let state):
            ConnectionSummary(
                state: state,
                showHosts: showHosts,
                showPairing: showPairing,
                reconnect: { Task { await model.reconnect() } }
            )
        }
    }
}

private struct ConnectionSummary: View {
    let state: RuntimeConnectionState
    let showHosts: () -> Void
    let showPairing: () -> Void
    let reconnect: () -> Void

    var body: some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                badge
                Text(title)
                    .font(.headline)
                Text(detail)
                    .foregroundStyle(.secondary)
                if case .unpaired = state {
                    Button(
                        "Pair with desktop", systemImage: "qrcode.viewfinder", action: showPairing
                    )
                    .buttonStyle(.glassProminent)
                } else if shouldShowHosts {
                    GlassActionGroup {
                        Button("View hosts", systemImage: "desktopcomputer", action: showHosts)
                            .buttonStyle(.glass)
                        if shouldReconnect {
                            Button("Reconnect", systemImage: "arrow.clockwise", action: reconnect)
                                .buttonStyle(.glassProminent)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var badge: some View {
        switch state {
        case .unpaired:
            SemanticBadge("Not paired", systemImage: "link.badge.plus", tint: .orange)
        case .paired:
            SemanticBadge("Paired", systemImage: "checkmark.shield.fill", tint: .green)
        case .connecting:
            SemanticBadge("Connecting", systemImage: "arrow.trianglehead.2.clockwise", tint: .blue)
        case .connected:
            SemanticBadge("Connected", systemImage: "checkmark.circle.fill", tint: .green)
        case .reconnecting:
            SemanticBadge(
                "Reconnecting", systemImage: "arrow.trianglehead.2.clockwise", tint: .orange)
        case .unavailable:
            SemanticBadge("Unavailable", systemImage: "exclamationmark.triangle.fill", tint: .red)
        case .authenticationFailed:
            SemanticBadge(
                "Authentication failed", systemImage: "key.slash.fill", tint: .red)
        }
    }

    private var title: LocalizedStringKey {
        switch state {
        case .unpaired:
            "No paired hosts"
        case .paired(let hostName):
            "Paired with \(hostName)"
        case .connecting(let hostName):
            "Connecting to \(hostName)"
        case .connected(let hostName):
            "Connected to \(hostName)"
        case .reconnecting(let hostName, _):
            "Reconnecting to \(hostName)"
        case .unavailable(let hostName, _):
            "Cannot reach \(hostName)"
        case .authenticationFailed(let hostName):
            "Pairing expired for \(hostName)"
        }
    }

    private var detail: LocalizedStringKey {
        switch state {
        case .unpaired:
            "Scan the QR code from Yiru on your desktop to add your first host."
        case .paired:
            "The desktop identity and device credential are stored securely on this device."
        case .connecting:
            "Yiru is establishing an encrypted runtime connection."
        case .connected:
            "Choose a workspace to continue."
        case .reconnecting(_, let reconnectAttempt):
            "Encrypted connection interrupted. Retry attempt \(reconnectAttempt)."
        case .unavailable(_, let reconnectAttempt):
            "The host is still unavailable after \(reconnectAttempt) attempts."
        case .authenticationFailed:
            "The saved credential was rejected. Pair this desktop again."
        }
    }

    private var shouldShowHosts: Bool {
        switch state {
        case .unpaired:
            false
        case .paired, .connecting, .connected, .reconnecting, .unavailable,
            .authenticationFailed:
            true
        }
    }

    private var shouldReconnect: Bool {
        switch state {
        case .reconnecting, .unavailable:
            true
        case .unpaired, .paired, .connecting, .connected, .authenticationFailed:
            false
        }
    }
}
