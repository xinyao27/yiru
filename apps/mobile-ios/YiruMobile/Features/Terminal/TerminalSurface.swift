import Foundation
import SwiftUI
import UIKit

nonisolated struct TerminalGridSize: Equatable, Sendable {
    let columns: Int
    let rows: Int
}

nonisolated struct TerminalSurfaceConfiguration: Equatable, Sendable {
    let fontSize: CGFloat
    let scrollbackLines: Int
    let accessoryKeys: [TerminalAccessoryKey]

    static func standard(
        textScale: Double = 1,
        accessoryKeys: [TerminalAccessoryKey] = TerminalAccessoryKey.standardVisibleOrder
    ) -> TerminalSurfaceConfiguration {
        TerminalSurfaceConfiguration(
            fontSize: 13 * textScale,
            scrollbackLines: 10_000,
            accessoryKeys: accessoryKeys
        )
    }
}

@MainActor
struct TerminalSurfaceEvents {
    var onInput: (Data) -> Void
    var onQueryReply: (Data) -> Void
    var onResize: (TerminalGridSize) -> Void
    var onTitleChange: (String) -> Void
    var onDirectoryChange: (String?) -> Void
    var onOpenLink: (String) -> Void
    var onClipboardWriteRequest: (Data) -> Void
    var onBell: () -> Void

    static let inactive = TerminalSurfaceEvents(
        onInput: { _ in },
        onQueryReply: { _ in },
        onResize: { _ in },
        onTitleChange: { _ in },
        onDirectoryChange: { _ in },
        onOpenLink: { _ in },
        onClipboardWriteRequest: { _ in },
        onBell: {}
    )
}

@MainActor
protocol TerminalSurface: AnyObject {
    var events: TerminalSurfaceEvents { get set }
    var view: UIView { get }

    func feed(_ bytes: Data)
    func restore(_ snapshot: TerminalReplaySnapshot)
    func clear()
    func focus()
    func apply(_ configuration: TerminalSurfaceConfiguration)
    func setInputEnabled(_ isEnabled: Bool)
}

nonisolated protocol TerminalSurfaceFactory: Sendable {
    @MainActor
    func makeSurface(configuration: TerminalSurfaceConfiguration) -> any TerminalSurface
}

struct TerminalSurfaceHost: UIViewRepresentable {
    let surface: any TerminalSurface

    func makeUIView(context: Context) -> UIView {
        surface.view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}
