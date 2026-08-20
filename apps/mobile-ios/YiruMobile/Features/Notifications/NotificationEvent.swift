nonisolated enum RuntimeNotificationEvent: Sendable {
    case notification(
        source: String,
        title: String,
        body: String,
        worktreeID: String?,
        notificationID: String?,
        sequence: Int64?
    )
    case dismiss(notificationID: String, sequence: Int64?)
    case ready(subscriptionID: String)
    case end

    var sequence: Int64? {
        switch self {
        case .notification(_, _, _, _, _, let sequence): sequence
        case .dismiss(_, let sequence): sequence
        case .ready, .end: nil
        }
    }
}

nonisolated protocol NotificationRuntimeRepository: Sendable {
    func notificationUpdates(for hostID: String) async throws
        -> AsyncThrowingStream<RuntimeNotificationEvent, Error>
    func missedNotifications(for hostID: String, after sequence: Int64) async throws
        -> [RuntimeNotificationEvent]
    func unsubscribeNotifications(for hostID: String, subscriptionID: String) async throws
}

nonisolated struct NotificationRoute: Sendable {
    let hostID: String
    let worktreeID: String?
}
