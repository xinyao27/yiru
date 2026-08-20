import Foundation

nonisolated enum PairingScope: String, Hashable, Sendable {
    case mobile
    case runtime
}

nonisolated struct PairingRelay: Hashable, Sendable {
    let directorURL: URL
    let cellURL: URL
    let assignmentEpoch: Int64
    let relayHostID: String
    let inviteToken: String
    let inviteExpiresAt: Date
}

nonisolated struct PairingOffer: Hashable, Sendable {
    let endpoint: String
    let deviceToken: String
    let publicKey: Data
    let publicKeyBase64: String
    let scope: PairingScope?
    let relay: PairingRelay?
}
