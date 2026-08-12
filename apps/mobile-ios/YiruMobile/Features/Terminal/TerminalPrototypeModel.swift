import Foundation
import Observation

@Observable
@MainActor
final class TerminalPrototypeModel {
    let surface: any TerminalSurface
    private(set) var gridSize: TerminalGridSize?
    private(set) var inputByteCount = 0
    private(set) var lastEvent = String(localized: "Renderer ready")

    @ObservationIgnored
    private var hasLoadedFixture = false

    init(factory: any TerminalSurfaceFactory) {
        let surface = factory.makeSurface(configuration: .standard)
        self.surface = surface
        surface.events = TerminalSurfaceEvents(
            onInput: { [weak self] data in
                self?.inputByteCount += data.count
                self?.lastEvent = String(localized: "Keyboard input received")
            },
            onResize: { [weak self] size in
                self?.gridSize = size
            },
            onTitleChange: { [weak self] _ in
                self?.lastEvent = String(localized: "Terminal title changed")
            },
            onDirectoryChange: { [weak self] _ in
                self?.lastEvent = String(localized: "Working directory changed")
            },
            onOpenLink: { [weak self] _ in
                self?.lastEvent = String(localized: "Link activation received")
            },
            onClipboardWriteRequest: { [weak self] _ in
                self?.lastEvent = String(localized: "Clipboard request blocked")
            },
            onBell: { [weak self] in
                self?.lastEvent = String(localized: "Terminal bell received")
            }
        )
    }

    func loadFixture() {
        guard !hasLoadedFixture else { return }
        hasLoadedFixture = true
        surface.feed(Data(Self.fixture.utf8))
    }

    func focus() {
        surface.focus()
    }

    private static let fixture = """
        \u{001B}[1;34mYiru native terminal\u{001B}[0m  SwiftTerm 1.18.0
        \u{001B}[2mCore Text / Core Graphics baseline · iOS 26\u{001B}[0m

        \u{001B}[32m✓\u{001B}[0m UTF-8: 你好 · こんにちは · 안녕하세요 · 👩🏽‍💻
        \u{001B}[33m!\u{001B}[0m OSC clipboard reads remain denied by default
        \u{001B}[36m→\u{001B}[0m https://yiru.app

        ┌────────────────────────────────────────────┐
        │ Renderer and transport remain independent │
        └────────────────────────────────────────────┘

        \u{001B}[1;35myiru\u{001B}[0m \u{001B}[2m~/workspaces/megamouth\u{001B}[0m $ 
        """
}
