import SwiftUI
import UIKit

enum Theme {
    enum Colors {
        static let accent = Color(red: 0.17, green: 0.48, blue: 0.98)
        static let atmosphereBlue = Color(red: 0.24, green: 0.58, blue: 1)
        static let atmospherePurple = Color(red: 0.56, green: 0.36, blue: 0.96)
        static let canvas = Color(uiColor: .systemGroupedBackground)
        static let content = Color(uiColor: .secondarySystemGroupedBackground)
    }

    enum Spacing {
        static let extraSmall: CGFloat = 4
        static let small: CGFloat = 8
        static let medium: CGFloat = 12
        static let standard: CGFloat = 16
        static let large: CGFloat = 20
        static let extraLarge: CGFloat = 24
        static let huge: CGFloat = 32
        static let page: CGFloat = standard
    }

    enum Radius {
        static let content: CGFloat = 18
        static let control: CGFloat = 14
        static let floatingSurface: CGFloat = 24
    }

    enum Opacity {
        static let atmosphere: Double = 0.22
        static let atmosphereSecondary: Double = 0.14
        static let statusFill: Double = 0.14
    }

    enum Size {
        static let minimumHitTarget: CGFloat = 44
        static let readingWidth: CGFloat = 720
    }

    enum Motion {
        static let stateChange = Animation.snappy(duration: 0.32)
        static let gentle = Animation.smooth(duration: 0.42)
    }

    enum Glass {
        static let groupSpacing: CGFloat = Spacing.small
    }
}
