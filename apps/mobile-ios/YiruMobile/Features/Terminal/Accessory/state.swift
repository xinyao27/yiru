import Foundation
import Observation

@Observable
@MainActor
final class TerminalAccessoryState {
    private(set) var isEnabled = false
    private(set) var isControlActive = false

    @ObservationIgnored
    private let onSend: (TerminalAccessoryKey) -> Void
    @ObservationIgnored
    private let onControlChange: (Bool) -> Void
    @ObservationIgnored
    private let onPaste: () -> Void
    @ObservationIgnored
    private let onDismiss: () -> Void

    init(
        onSend: @escaping (TerminalAccessoryKey) -> Void,
        onControlChange: @escaping (Bool) -> Void,
        onPaste: @escaping () -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.onSend = onSend
        self.onControlChange = onControlChange
        self.onPaste = onPaste
        self.onDismiss = onDismiss
    }

    func setEnabled(_ isEnabled: Bool) {
        self.isEnabled = isEnabled
        guard !isEnabled, isControlActive else { return }
        isControlActive = false
        onControlChange(false)
    }

    func send(_ key: TerminalAccessoryKey) {
        guard isEnabled else { return }
        onSend(key)
    }

    func toggleControl() {
        guard isEnabled else { return }
        isControlActive.toggle()
        onControlChange(isControlActive)
    }

    func paste() {
        guard isEnabled else { return }
        onPaste()
    }

    func dismiss() {
        onDismiss()
    }

    func controlModifierDidReset() {
        isControlActive = false
    }
}
