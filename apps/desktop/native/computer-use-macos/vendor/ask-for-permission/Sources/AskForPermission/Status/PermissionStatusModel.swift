import AppKit
import ApplicationServices
import Combine
import CoreGraphics
import IOKit.hid

@MainActor
final class PermissionStatusModel: ObservableObject {
    @Published private(set) var isAccessibilityGranted: Bool = false
    @Published private(set) var isScreenRecordingGranted: Bool = false
    @Published private(set) var isInputMonitoringGranted: Bool = false
    @Published private(set) var isFullDiskAccessGranted: Bool = false
    @Published private(set) var isDeveloperToolsGranted: Bool = false
    @Published private(set) var isAppManagementGranted: Bool = false
    @Published var activePermissionRequest: PermissionKind?
    @Published var inProgressPermission: PermissionKind?

    private let permissionKinds: Set<PermissionKind>
    private var timer: Timer?

    init(permissionKinds: Set<PermissionKind> = Set(PermissionKind.allCases)) {
        self.permissionKinds = permissionKinds
        refresh()
        startPolling()
    }

    deinit {
        timer?.invalidate()
    }

    func isGranted(_ kind: PermissionKind) -> Bool {
        switch kind {
        case .accessibility: return isAccessibilityGranted
        case .screenRecording: return isScreenRecordingGranted
        case .inputMonitoring: return isInputMonitoringGranted
        case .fullDiskAccess: return isFullDiskAccessGranted
        case .developerTools: return isDeveloperToolsGranted
        case .appManagement: return isAppManagementGranted
        }
    }

    func refresh() {
        if permissionKinds.contains(.accessibility) {
            let granted = AXIsProcessTrusted()
            if granted != isAccessibilityGranted { isAccessibilityGranted = granted }
        }
        if permissionKinds.contains(.screenRecording) {
            let granted = CGPreflightScreenCaptureAccess()
            if granted != isScreenRecordingGranted { isScreenRecordingGranted = granted }
        }
        if permissionKinds.contains(.inputMonitoring) {
            let granted = IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) == kIOHIDAccessTypeGranted
            if granted != isInputMonitoringGranted { isInputMonitoringGranted = granted }
        }
        if permissionKinds.contains(.fullDiskAccess) {
            let granted = fullDiskAccessProbe()
            if granted != isFullDiskAccessGranted { isFullDiskAccessGranted = granted }
        }
        if permissionKinds.contains(.developerTools) {
            let granted = developerToolsTCCService().map(tccAccessPreflight(service:)) ?? false
            if granted != isDeveloperToolsGranted { isDeveloperToolsGranted = granted }
        }
        if permissionKinds.contains(.appManagement) {
            let granted = appManagementTCCService().map(tccAccessPreflight(service:)) ?? false
            if granted != isAppManagementGranted { isAppManagementGranted = granted }
        }
    }

    func publisher(for kind: PermissionKind) -> AnyPublisher<Bool, Never> {
        switch kind {
        case .accessibility: return $isAccessibilityGranted.eraseToAnyPublisher()
        case .screenRecording: return $isScreenRecordingGranted.eraseToAnyPublisher()
        case .inputMonitoring: return $isInputMonitoringGranted.eraseToAnyPublisher()
        case .fullDiskAccess: return $isFullDiskAccessGranted.eraseToAnyPublisher()
        case .developerTools: return $isDeveloperToolsGranted.eraseToAnyPublisher()
        case .appManagement: return $isAppManagementGranted.eraseToAnyPublisher()
        }
    }

    private func startPolling() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.75, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    private func fullDiskAccessProbe() -> Bool {
        for path in fullDiskAccessProbePaths {
            let fd = open(path, O_RDONLY | O_CLOEXEC)
            if fd >= 0 {
                close(fd)
                return true
            }

            let error = errno
            if error == EPERM || error == EACCES { return false }
            if error != ENOENT { return false }
        }
        return false
    }
}

private let homeDirectoryURL = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true)
private let fullDiskAccessProbePaths = [
    homeDirectoryURL
        .appendingPathComponent("Library", isDirectory: true)
        .appendingPathComponent("Safari", isDirectory: true)
        .appendingPathComponent("Bookmarks.plist")
        .path,
    homeDirectoryURL
        .appendingPathComponent("Library", isDirectory: true)
        .appendingPathComponent("Application Support", isDirectory: true)
        .appendingPathComponent("com.apple.TCC", isDirectory: true)
        .appendingPathComponent("TCC.db")
        .path,
]
