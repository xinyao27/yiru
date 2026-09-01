import Foundation
import Observation
import UserNotifications

nonisolated enum NotificationPermission: Sendable {
    case undetermined
    case granted
    case denied
}

@Observable
@MainActor
final class NotificationSettingsModel {
    private(set) var isEnabled = false
    private(set) var permission = NotificationPermission.undetermined
    private(set) var isUpdating = false

    @ObservationIgnored
    private let defaults: UserDefaults
    @ObservationIgnored
    private weak var coordinator: NotificationCoordinator?

    init(
        defaults: UserDefaults = .standard,
        coordinator: NotificationCoordinator? = nil
    ) {
        self.defaults = defaults
        self.coordinator = coordinator
    }

    func refresh() async {
        guard !isUpdating else { return }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        permission = permissionState(settings.authorizationStatus)
        isEnabled = NotificationPreference.isEnabled(defaults: defaults) && permission == .granted
        await coordinator?.refreshRemoteRegistration()
    }

    func setEnabled(_ shouldEnable: Bool) async {
        guard !isUpdating else { return }
        isUpdating = true
        defer { isUpdating = false }

        if shouldEnable {
            do {
                let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                    options: [.alert, .badge, .sound]
                )
                NotificationPreference.save(granted, defaults: defaults)
            } catch {
                NotificationPreference.save(false, defaults: defaults)
            }
        } else {
            NotificationPreference.save(false, defaults: defaults)
        }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        permission = permissionState(settings.authorizationStatus)
        isEnabled = NotificationPreference.isEnabled(defaults: defaults) && permission == .granted
        await coordinator?.refreshRemoteRegistration()
    }

    private func permissionState(_ status: UNAuthorizationStatus) -> NotificationPermission {
        switch status {
        case .authorized, .provisional, .ephemeral:
            .granted
        case .denied:
            .denied
        case .notDetermined:
            .undetermined
        @unknown default:
            .undetermined
        }
    }
}
