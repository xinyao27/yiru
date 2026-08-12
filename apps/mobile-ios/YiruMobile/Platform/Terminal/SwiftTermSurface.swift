import Foundation
import SwiftTerm
import UIKit

@MainActor
final class SwiftTermSurface: NSObject, TerminalSurface, TerminalViewDelegate {
    var events: TerminalSurfaceEvents = .inactive

    private let terminalView: YiruTerminalView
    private let accessoryState: TerminalAccessoryState
    private let accessoryView: TerminalAccessoryInputView
    private var isRestoringSnapshot = false

    init(configuration: TerminalSurfaceConfiguration) {
        let configuredTerminalView = YiruTerminalView(
            frame: .zero,
            font: .monospacedSystemFont(ofSize: configuration.fontSize, weight: .regular)
        )
        configuredTerminalView.captureModeAwareAccessory()
        terminalView = configuredTerminalView
        accessoryState = TerminalAccessoryState(
            keys: configuration.accessoryKeys,
            onSend: { [weak terminalView = configuredTerminalView] key in
                terminalView?.sendAccessoryKey(key)
            },
            onControlChange: { [weak terminalView = configuredTerminalView] isActive in
                terminalView?.controlModifier = isActive
            },
            onPaste: { [weak terminalView = configuredTerminalView] in
                terminalView?.paste(nil)
            },
            onDismiss: { [weak terminalView = configuredTerminalView] in
                terminalView?.resignFirstResponder()
            }
        )
        accessoryView = TerminalAccessoryInputView(
            state: accessoryState,
            terminalView: configuredTerminalView
        )
        super.init()
        terminalView.onQueryReply = { [weak self] data in
            guard let self, !isRestoringSnapshot else { return }
            events.onQueryReply(data)
        }
        terminalView.terminalDelegate = self
        terminalView.optionAsMetaKey = false
        terminalView.allowMouseReporting = true
        terminalView.nativeForegroundColor = UIColor(
            red: 0.86,
            green: 0.89,
            blue: 0.94,
            alpha: 1
        )
        terminalView.nativeBackgroundColor = UIColor(
            red: 0.035,
            green: 0.047,
            blue: 0.075,
            alpha: 1
        )
        terminalView.backgroundOpacity = 1
        terminalView.changeScrollback(configuration.scrollbackLines)
        terminalView.inputAccessoryView = accessoryView
    }

    var view: UIView {
        terminalView
    }

    func feed(_ bytes: Data) {
        let buffer = [UInt8](bytes)
        terminalView.feed(byteArray: buffer[...])
    }

    func restore(_ snapshot: TerminalReplaySnapshot) {
        isRestoringSnapshot = true
        terminalView.resize(cols: snapshot.columns, rows: snapshot.rows)
        feed(Data([0x1B, 0x63]))
        feed(snapshot.replayBytes)
        isRestoringSnapshot = false
    }

    func clear() {
        terminalView.clearScrollback()
    }

    func focus() {
        _ = terminalView.becomeFirstResponder()
    }

    func setInputEnabled(_ isEnabled: Bool) {
        accessoryState.setEnabled(isEnabled)
    }

    func apply(_ configuration: TerminalSurfaceConfiguration) {
        if terminalView.font.pointSize != configuration.fontSize {
            terminalView.font = .monospacedSystemFont(
                ofSize: configuration.fontSize,
                weight: .regular
            )
        }
        terminalView.changeScrollback(configuration.scrollbackLines)
        accessoryState.setKeys(configuration.accessoryKeys)
    }

    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
        guard !isRestoringSnapshot else { return }
        events.onResize(TerminalGridSize(columns: newCols, rows: newRows))
    }

    func setTerminalTitle(source: TerminalView, title: String) {
        events.onTitleChange(title)
    }

    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {
        events.onDirectoryChange(directory)
    }

    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        events.onInput(Data(data))
    }

    func scrolled(source: TerminalView, position: Double) {}

    func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {
        events.onOpenLink(link)
    }

    func bell(source: TerminalView) {
        events.onBell()
    }

    func clipboardCopy(source: TerminalView, content: Data) {
        events.onClipboardWriteRequest(content)
    }

    func clipboardRead(source: TerminalView) -> Data? {
        nil
    }

    func iTermContent(source: TerminalView, content: ArraySlice<UInt8>) {}

    func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
}

private final class YiruTerminalView: TerminalView {
    var onQueryReply: (Data) -> Void = { _ in }
    private var modeAwareAccessory: TerminalAccessory?

    func captureModeAwareAccessory() {
        modeAwareAccessory = inputAccessoryView as? TerminalAccessory
    }

    func sendAccessoryKey(_ key: TerminalAccessoryKey) {
        switch key {
        case .escape:
            send([0x1B])
        case .tab:
            send([0x09])
        case .arrowLeft:
            sendModeAwareArrow(selectorName: "left:")
        case .arrowDown:
            sendModeAwareArrow(selectorName: "down:")
        case .arrowUp:
            sendModeAwareArrow(selectorName: "up:")
        case .arrowRight:
            sendModeAwareArrow(selectorName: "right:")
        case .backspace:
            send([0x7F])
        case .interrupt:
            send([0x03])
        case .endOfFile:
            send([0x04])
        case .clearScreen:
            send([0x0C])
        case .suspend:
            send([0x1A])
        }
    }

    override func send(source: Terminal, data: ArraySlice<UInt8>) {
        onQueryReply(Data(data))
    }

    private func sendModeAwareArrow(selectorName: String) {
        guard let modeAwareAccessory else { return }
        // Why: SwiftTerm's arrow actions are internal, but its public accessory exposes them to
        // UIKit. Routing through those actions preserves application-cursor and bidi state.
        UIApplication.shared.sendAction(
            NSSelectorFromString(selectorName),
            to: modeAwareAccessory,
            from: nil,
            for: nil
        )
        UIApplication.shared.sendAction(
            NSSelectorFromString("cancelTimer"),
            to: modeAwareAccessory,
            from: nil,
            for: nil
        )
    }
}

nonisolated struct SwiftTermSurfaceFactory: TerminalSurfaceFactory {
    @MainActor
    func makeSurface(configuration: TerminalSurfaceConfiguration) -> any TerminalSurface {
        SwiftTermSurface(configuration: configuration)
    }
}
