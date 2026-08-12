import SwiftUI

struct TerminalLiveView: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: TerminalLiveModel

    init(
        host: HostProfile,
        terminal: TerminalSummary,
        runtime: any TerminalSessionRuntime,
        surfaceFactory: any TerminalSurfaceFactory
    ) {
        _model = State(
            initialValue: TerminalLiveModel(
                host: host,
                terminal: terminal,
                runtime: runtime,
                surfaceFactory: surfaceFactory
            )
        )
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            TerminalSurfaceHost(surface: model.surface)
                .background(Color(red: 0.035, green: 0.047, blue: 0.075))

            statusOverlay
                .padding(Theme.Spacing.standard)
        }
        .navigationTitle(Text(model.title))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: model.connectionAttempt) {
            await model.connect(attempt: model.connectionAttempt)
        }
        .onChange(of: model.linkRequest) { _, link in
            guard let link else { return }
            openURL(link)
            model.clearLinkRequest()
        }
        .task(id: scenePhase) {
            switch scenePhase {
            case .active:
                await model.setAppState(.foreground)
            case .background:
                await model.setAppState(.background)
            case .inactive:
                break
            @unknown default:
                break
            }
        }
        .sensoryFeedback(.warning, trigger: model.bellRevision)
    }

    private var statusOverlay: some View {
        FloatingGlassSurface {
            HStack(spacing: Theme.Spacing.medium) {
                VStack(alignment: .trailing, spacing: Theme.Spacing.extraSmall) {
                    Label(statusTitle, systemImage: statusIcon)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(statusTint)
                    if let statusDetail {
                        Text(statusDetail)
                            .font(.caption2.monospaced())
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                if showsRetry {
                    Button("Reconnect", systemImage: "arrow.clockwise", action: model.retry)
                        .buttonStyle(.glassProminent)
                } else {
                    Button("Keyboard", systemImage: "keyboard", action: model.focus)
                        .buttonStyle(.glassProminent)
                        .disabled(!model.canAcceptUserInput)
                }
            }
        }
    }

    private var statusTitle: LocalizedStringResource {
        switch model.phase {
        case .connecting: "Connecting"
        case .reconnecting: "Reconnecting"
        case .restoring: "Restoring terminal"
        case .active: "Live"
        case .ended: "Terminal ended"
        case .failed: "Connection interrupted"
        }
    }

    private var statusIcon: String {
        switch model.phase {
        case .connecting, .reconnecting, .restoring:
            "arrow.trianglehead.2.clockwise.rotate.90"
        case .active: "waveform.path"
        case .ended: "stop.circle"
        case .failed: "wifi.exclamationmark"
        }
    }

    private var statusTint: Color {
        switch model.phase {
        case .active: .green
        case .failed: .orange
        case .connecting, .reconnecting, .restoring, .ended: .secondary
        }
    }

    private var statusDetail: String? {
        if case .failed(let message) = model.phase {
            return String(localized: message)
        }
        if case .reconnecting(let attempt) = model.phase {
            return String(localized: "Retry attempt \(attempt).")
        }
        if let directory = model.currentDirectory, !directory.isEmpty {
            return directory
        }
        guard let gridSize = model.gridSize else { return nil }
        return "\(gridSize.columns) × \(gridSize.rows)"
    }

    private var showsRetry: Bool {
        switch model.phase {
        case .reconnecting, .failed, .ended: true
        case .connecting, .restoring, .active: false
        }
    }
}
