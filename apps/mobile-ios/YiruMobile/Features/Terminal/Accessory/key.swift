import Foundation

nonisolated enum TerminalAccessoryKey: String, CaseIterable, Identifiable, Sendable {
    case escape
    case tab
    case arrowLeft
    case arrowDown
    case arrowUp
    case arrowRight
    case backspace
    case interrupt
    case endOfFile
    case clearScreen
    case suspend

    var id: Self { self }

    var title: LocalizedStringResource {
        switch self {
        case .escape:
            "Esc"
        case .tab:
            "Tab"
        case .arrowLeft:
            "Left"
        case .arrowDown:
            "Down"
        case .arrowUp:
            "Up"
        case .arrowRight:
            "Right"
        case .backspace:
            "Delete"
        case .interrupt:
            "Ctrl+C"
        case .endOfFile:
            "Ctrl+D"
        case .clearScreen:
            "Ctrl+L"
        case .suspend:
            "Ctrl+Z"
        }
    }

    var accessibilityLabel: LocalizedStringResource {
        switch self {
        case .escape:
            "Escape"
        case .tab:
            "Tab"
        case .arrowLeft:
            "Arrow left"
        case .arrowDown:
            "Arrow down"
        case .arrowUp:
            "Arrow up"
        case .arrowRight:
            "Arrow right"
        case .backspace:
            "Backspace"
        case .interrupt:
            "Interrupt process"
        case .endOfFile:
            "Send end of file"
        case .clearScreen:
            "Clear screen"
        case .suspend:
            "Suspend process"
        }
    }

    var systemImage: String? {
        switch self {
        case .arrowLeft:
            "arrow.left"
        case .arrowDown:
            "arrow.down"
        case .arrowUp:
            "arrow.up"
        case .arrowRight:
            "arrow.right"
        case .backspace:
            "delete.left"
        case .escape, .tab, .interrupt, .endOfFile, .clearScreen, .suspend:
            nil
        }
    }

    var repeatsWhilePressed: Bool {
        switch self {
        case .arrowLeft, .arrowDown, .arrowUp, .arrowRight, .backspace:
            true
        case .escape, .tab, .interrupt, .endOfFile, .clearScreen, .suspend:
            false
        }
    }
}
