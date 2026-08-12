import SwiftUI

struct SemanticBadge: View {
    private let title: LocalizedStringKey
    private let systemImage: String
    private let tint: Color

    init(_ title: LocalizedStringKey, systemImage: String, tint: Color) {
        self.title = title
        self.systemImage = systemImage
        self.tint = tint
    }

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, Theme.Spacing.medium)
            .padding(.vertical, Theme.Spacing.small)
            .background(tint.opacity(Theme.Opacity.statusFill), in: Capsule())
    }
}
