import Foundation

public enum PermissionKind: String, CaseIterable, Sendable {
    case accessibility
    case screenRecording
    case inputMonitoring
    case fullDiskAccess
    case developerTools
    case appManagement

    public var displayName: String {
        switch self {
        case .accessibility:
            return translate("permission.accessibility.title", fallback: "Accessibility")
        case .screenRecording:
            return translate("permission.screen-recording.title", fallback: "Screen Recording")
        case .inputMonitoring:
            return translate("permission.input-monitoring.title", fallback: "Input Monitoring")
        case .fullDiskAccess:
            return translate("permission.full-disk-access.title", fallback: "Full Disk Access")
        case .developerTools:
            return translate("permission.developer-tools.title", fallback: "Developer Tools")
        case .appManagement:
            return translate("permission.app-management.title", fallback: "App Management")
        }
    }

    public var shortDescription: String {
        switch self {
        case .accessibility:
            return translate(
                "permission.accessibility.description",
                fallback: "Needed to click, type, and read on-screen content for you."
            )
        case .screenRecording:
            return translate(
                "permission.screen-recording.description",
                fallback: "Needed to take screenshots so it knows where to click."
            )
        case .inputMonitoring:
            return translate(
                "permission.input-monitoring.description",
                fallback: "Needed to observe keyboard and mouse input for you."
            )
        case .fullDiskAccess:
            return translate(
                "permission.full-disk-access.description",
                fallback: "Needed to read protected app data and files for you."
            )
        case .developerTools:
            return translate(
                "permission.developer-tools.description",
                fallback: "Needed to run trusted developer tools for you."
            )
        case .appManagement:
            return translate(
                "permission.app-management.description",
                fallback: "Needed to manage other app bundles for you."
            )
        }
    }

    var systemSettingsQuery: String {
        switch self {
        case .accessibility: return "Privacy_Accessibility"
        case .screenRecording: return "Privacy_ScreenCapture"
        case .inputMonitoring: return "Privacy_ListenEvent"
        case .fullDiskAccess: return "Privacy_AllFiles"
        case .developerTools: return "Privacy_DevTools"
        case .appManagement: return "Privacy_AppBundles"
        }
    }

    var systemSettingsURL: URL {
        URL(string: "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?\(systemSettingsQuery)")!
    }
}
