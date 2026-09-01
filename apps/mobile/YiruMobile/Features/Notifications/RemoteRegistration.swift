import Foundation
import UIKit

@MainActor
final class YiruApplicationDelegate: NSObject, UIApplicationDelegate {
    nonisolated func application(
        _: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in
            NotificationRemoteRegistration.shared.receive(token: token)
        }
    }
}

@MainActor
final class NotificationRemoteRegistration {
    static let shared = NotificationRemoteRegistration()
    private weak var coordinator: NotificationCoordinator?
    private var pendingToken: String?

    private init() {}

    func install(coordinator: NotificationCoordinator) {
        self.coordinator = coordinator
        if let pendingToken {
            self.pendingToken = nil
            coordinator.receiveRemoteDeviceToken(pendingToken)
        }
    }

    func receive(token: String) {
        guard let coordinator else {
            pendingToken = token
            return
        }
        coordinator.receiveRemoteDeviceToken(token)
    }
}
