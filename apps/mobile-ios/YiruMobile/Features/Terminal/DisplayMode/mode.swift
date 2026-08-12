import Foundation

nonisolated enum TerminalDisplayMode: String, Equatable, Sendable {
    case auto
    case desktop

    var title: LocalizedStringResource {
        switch self {
        case .auto:
            "Phone Fit"
        case .desktop:
            "Desktop Size"
        }
    }

    var systemImage: String {
        switch self {
        case .auto:
            "iphone"
        case .desktop:
            "desktopcomputer"
        }
    }

    var toggleTarget: TerminalDisplayMode {
        switch self {
        case .auto:
            .desktop
        case .desktop:
            .auto
        }
    }

    var toggleTitle: LocalizedStringResource {
        switch toggleTarget {
        case .auto:
            "Switch to Phone Fit"
        case .desktop:
            "Switch to Desktop Size"
        }
    }
}
