import SwiftUI

struct PairingConfirmView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var model: PairingModel
    @State private var pairingTask: Task<Void, Never>?

    private let onPaired: (HostProfile) -> Void

    init(
        offer: PairingOffer, runtime: any PairingRuntime, onPaired: @escaping (HostProfile) -> Void
    ) {
        _model = State(initialValue: PairingModel(offer: offer, runtime: runtime))
        self.onPaired = onPaired
    }

    var body: some View {
        ZStack {
            AtmosphereBackground()

            ScrollView {
                VStack(spacing: Theme.Spacing.large) {
                    identity
                    status
                    actions
                }
                .frame(maxWidth: Theme.Size.readingWidth)
                .padding(Theme.Spacing.page)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(Text("Confirm pairing"))
        .navigationBarBackButtonHidden(model.isConnecting)
        .onDisappear {
            pairingTask?.cancel()
            pairingTask = nil
        }
    }

    private var identity: some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                Label("Pair with this desktop?", systemImage: "desktopcomputer")
                    .font(.title2.weight(.semibold))
                Text(
                    "Confirm to add this desktop to your hosts over an end-to-end encrypted connection."
                )
                .foregroundStyle(.secondary)
                LabeledContent("Endpoint", value: redactedEndpoint)
                LabeledContent("Transport", value: "Direct")
            }
        }
    }

    @ViewBuilder
    private var status: some View {
        switch model.phase {
        case .ready:
            EmptyView()
        case .connecting:
            ContentSurface {
                HStack(spacing: Theme.Spacing.medium) {
                    ProgressView()
                    VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                        Text("Establishing secure connection…")
                            .font(.headline)
                        Text("Verifying the desktop key and authenticating this device.")
                            .foregroundStyle(.secondary)
                    }
                }
            }
        case .failed(let message):
            ContentSurface {
                Label {
                    Text(message)
                } icon: {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }
        }
    }

    private var actions: some View {
        GlassActionGroup {
            Button("Cancel", role: .cancel) { dismiss() }
                .buttonStyle(.glass)
                .disabled(model.isConnecting)

            Button {
                beginPairing()
            } label: {
                Text(model.hasFailed ? "Try again" : "Pair")
            }
            .buttonStyle(.glassProminent)
            .disabled(model.isConnecting)
        }
    }

    private var redactedEndpoint: String {
        guard let components = URLComponents(string: model.offer.endpoint),
            let host = components.host
        else {
            return String(localized: "Unknown endpoint")
        }
        return components.port.map { "\(host):\($0)" } ?? host
    }

    private func beginPairing() {
        pairingTask?.cancel()
        pairingTask = Task {
            if let host = await model.pair() {
                onPaired(host)
            }
        }
    }
}
