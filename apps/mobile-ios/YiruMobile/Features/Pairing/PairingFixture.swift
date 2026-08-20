#if DEBUG
    import Foundation
    import SwiftUI

    struct PairingScanFixtureView: View {
        var body: some View {
            NavigationStack {
                PairingScanView(
                    runtime: PairingFixtureRuntime(),
                    initialPastedCode: Self.pairingCode,
                    onPaired: { _ in }
                )
            }
        }

        private static var pairingCode: String {
            let wire = PairingOfferWire(
                v: MobilePairingWireContract.offerVersion,
                endpoint: "wss://mac-studio.local:6768",
                deviceToken: "fixture-device-token",
                publicKeyB64: Data(repeating: 7, count: 32).base64EncodedString(),
                scope: .mobile,
                relay: nil
            )
            guard let data = try? JSONEncoder().encode(wire) else { return "" }
            return data.base64EncodedString()
                .replacingOccurrences(of: "+", with: "-")
                .replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
        }
    }

    struct PairingConfirmFixtureView: View {
        var body: some View {
            NavigationStack {
                PairingConfirmView(
                    offer: PairingOffer(
                        endpoint: "wss://mac-studio.local:6768",
                        deviceToken: "fixture-device-token",
                        publicKey: Data(repeating: 7, count: 32),
                        publicKeyBase64: "fixture-public-key",
                        scope: .mobile,
                        relay: nil
                    ),
                    runtime: PairingFixtureRuntime(),
                    onPaired: { _ in },
                    onCancel: {}
                )
            }
        }
    }

    nonisolated private struct PairingFixtureRuntime: PairingRuntime {
        func pair(
            _ offer: PairingOffer,
            log: @escaping PairingLogSink
        ) async throws -> HostProfile {
            await log(.info, "Opening WebSocket", offer.endpoint)
            await log(.info, "Starting encrypted handshake", nil)
            try await Task.sleep(for: .milliseconds(900))
            await log(.success, "Secure connection established", nil)
            return HostProfile(
                id: "fixture-host",
                name: "Mac Studio",
                endpoint: offer.endpoint,
                publicKeyBase64: offer.publicKeyBase64,
                lastConnected: Date()
            )
        }
    }
#endif
