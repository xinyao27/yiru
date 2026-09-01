extension RuntimeClient: NotificationRuntimeRepository {
    func registerRemoteNotifications(
        for hostID: String,
        token: String?,
        environment: String?
    ) async throws {
        let _: MobileNotificationRegisterPushResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileNotificationsWireContract.registerPushPath,
            input: MobileNotificationRegisterPushRequestWire(
                environment: environment,
                token: token
            ),
            output: MobileNotificationRegisterPushResultWire.self
        )
    }

    func notificationUpdates(for hostID: String) async throws
        -> AsyncThrowingStream<RuntimeNotificationEvent, Error>
    {
        let source = try await subscribeRuntime(
            hostID: hostID,
            path: MobileNotificationsWireContract.subscribePath,
            input: RuntimeVoidInput(),
            output: MobileNotificationEventWire.self
        )
        let (stream, continuation) = AsyncThrowingStream.makeStream(
            of: RuntimeNotificationEvent.self
        )
        let task = Task {
            do {
                for try await event in source {
                    continuation.yield(mapNotificationEvent(event))
                }
                continuation.finish()
            } catch is CancellationError {
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in task.cancel() }
        return stream
    }

    func missedNotifications(for hostID: String, after sequence: Int64) async throws
        -> [RuntimeNotificationEvent]
    {
        let result: MobileNotificationGetMissedResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileNotificationsWireContract.getMissedPath,
            input: MobileNotificationGetMissedRequestWire(lastSeenSeq: max(sequence, 0)),
            output: MobileNotificationGetMissedResultWire.self
        )
        return result.notifications.map(mapNotificationEvent)
    }

    func unsubscribeNotifications(for hostID: String, subscriptionID: String) async throws {
        let _: MobileNotificationUnsubscribeResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileNotificationsWireContract.unsubscribePath,
            input: MobileNotificationUnsubscribeRequestWire(subscriptionId: subscriptionID),
            output: MobileNotificationUnsubscribeResultWire.self
        )
    }
}

nonisolated private func mapNotificationEvent(_ wire: MobileNotificationEventWire)
    -> RuntimeNotificationEvent
{
    switch wire {
    case .notification(
        let source,
        let title,
        let body,
        let worktreeID,
        let notificationID,
        let sequence
    ):
        .notification(
            source: source,
            title: title,
            body: body,
            worktreeID: worktreeID,
            notificationID: notificationID,
            sequence: sequence
        )
    case .dismiss(let notificationID, let sequence):
        .dismiss(notificationID: notificationID, sequence: sequence)
    case .ready(let subscriptionID):
        .ready(subscriptionID: subscriptionID)
    case .end:
        .end
    }
}
