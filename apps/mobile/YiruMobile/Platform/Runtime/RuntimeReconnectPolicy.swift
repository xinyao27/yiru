import Foundation

nonisolated struct RuntimeReconnectPolicy: Sendable {
    let delays: [Duration]
    let fastAttemptLimit: Int
    let trickleDelay: Duration
    let authenticationRetryLimit: Int

    static let mobile = RuntimeReconnectPolicy(
        delays: [
            .milliseconds(500), .seconds(1), .seconds(2), .seconds(4), .seconds(8),
            .seconds(15), .seconds(30), .seconds(60),
        ],
        fastAttemptLimit: 12,
        trickleDelay: .seconds(90),
        authenticationRetryLimit: 3
    )

    func delay(after attempt: Int) -> Duration {
        guard attempt < fastAttemptLimit else { return trickleDelay }
        return delays[min(max(0, attempt - 1), delays.count - 1)]
    }
}
