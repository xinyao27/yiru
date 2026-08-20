import SwiftUI

struct ContentSurface<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        let shape = RoundedRectangle(
            cornerRadius: Theme.Radius.content,
            style: .continuous
        )
        content
            .padding(Theme.Spacing.standard)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                Theme.Colors.content,
                in: shape
            )
            .overlay(shape.stroke(Theme.Colors.divider, lineWidth: Theme.Size.hairline))
    }
}
