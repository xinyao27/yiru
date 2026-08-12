import Foundation
import Observation

enum PairingPhase {
    case ready
    case connecting
    case failed(LocalizedStringResource)
}

@Observable
@MainActor
final class PairingModel {
    let offer: PairingOffer
    private(set) var phase: PairingPhase = .ready

    @ObservationIgnored
    private let runtime: any PairingRuntime

    init(offer: PairingOffer, runtime: any PairingRuntime) {
        self.offer = offer
        self.runtime = runtime
    }

    func pair() async -> HostProfile? {
        phase = .connecting
        do {
            let host = try await runtime.pair(offer)
            guard !Task.isCancelled else { return nil }
            return host
        } catch is CancellationError {
            phase = .ready
            return nil
        } catch PairingRuntimeError.timeout {
            phase = .failed(
                "The desktop did not respond within 25 seconds. Check the connection and try again."
            )
        } catch PairingRuntimeError.authenticationFailed {
            phase = .failed(
                "The desktop rejected this pairing code. Generate a new code and try again.")
        } catch {
            phase = .failed("Yiru could not establish a secure connection to this desktop.")
        }
        return nil
    }

    func retry() {
        phase = .ready
    }

    var isConnecting: Bool {
        if case .connecting = phase { return true }
        return false
    }

    var hasFailed: Bool {
        if case .failed = phase { return true }
        return false
    }
}
