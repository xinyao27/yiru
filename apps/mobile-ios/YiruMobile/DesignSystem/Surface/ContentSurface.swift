import SwiftUI

struct ContentSurface<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(Theme.Spacing.standard)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                Theme.Colors.content,
                in: RoundedRectangle(
                    cornerRadius: Theme.Radius.content,
                    style: .continuous
                )
            )
    }
}
