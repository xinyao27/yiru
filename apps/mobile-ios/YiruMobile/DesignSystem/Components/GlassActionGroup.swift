import SwiftUI

struct GlassActionGroup<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        GlassEffectContainer(spacing: Theme.Glass.groupSpacing) {
            HStack(spacing: Theme.Glass.groupSpacing) {
                content
            }
        }
    }
}
