import SwiftTerm
import SwiftUI
import UIKit

@MainActor
final class TerminalAccessoryInputView: UIInputView {
    private let hostingController: UIHostingController<TerminalAccessoryBar>
    private let accessoryState: TerminalAccessoryState

    init(state: TerminalAccessoryState, terminalView: TerminalView) {
        hostingController = UIHostingController(rootView: TerminalAccessoryBar(state: state))
        accessoryState = state
        super.init(frame: .zero, inputViewStyle: .keyboard)
        allowsSelfSizing = true
        hostingController.sizingOptions = [.intrinsicContentSize]
        hostingController.view.backgroundColor = .clear
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        addSubview(hostingController.view)
        NSLayoutConstraint.activate([
            hostingController.view.leadingAnchor.constraint(equalTo: leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: trailingAnchor),
            hostingController.view.topAnchor.constraint(equalTo: topAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(controlModifierDidReset),
            name: .terminalViewControlModifierReset,
            object: terminalView
        )
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is unavailable")
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: 60)
    }

    @objc
    private func controlModifierDidReset() {
        accessoryState.controlModifierDidReset()
    }
}
