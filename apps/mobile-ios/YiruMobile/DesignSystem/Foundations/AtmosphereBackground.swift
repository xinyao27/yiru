import SwiftUI

struct AtmosphereBackground: View {
    var body: some View {
        ZStack {
            Theme.Colors.canvas

            LinearGradient(
                colors: [
                    Theme.Colors.atmosphereBlue.opacity(Theme.Opacity.atmosphere),
                    .clear,
                    Theme.Colors.atmospherePurple.opacity(Theme.Opacity.atmosphereSecondary),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}
