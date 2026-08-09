import AppKit
import Foundation

private let systemSettingsBundleIdentifiers: Set<String> = [
    "com.apple.systempreferences",
    "com.apple.SystemSettings",
]

private let systemSettingsOwnerNames: Set<String> = [
    "System Settings",
    "System Preferences",
]

func isSystemSettingsApplication(ownerName: String?, ownerPID: pid_t?) -> Bool {
    if let ownerPID,
       let bundleIdentifier = NSRunningApplication(processIdentifier: ownerPID)?.bundleIdentifier,
       systemSettingsBundleIdentifiers.contains(bundleIdentifier) {
        return true
    }
    return ownerName.map(systemSettingsOwnerNames.contains) ?? false
}
