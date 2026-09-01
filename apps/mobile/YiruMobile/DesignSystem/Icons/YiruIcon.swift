import SwiftUI
import UIKit

/// The only SwiftUI entry point for user-interface icons in Yiru.
struct YiruIcon: View {
    private let icon: YiruIconID
    private let size: CGFloat

    init(_ icon: YiruIconID, size: CGFloat = 16) {
        self.icon = icon
        self.size = size
    }

    var body: some View {
        icon.image()
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// The shared Hugeicons label for native navigation-bar actions.
struct YiruToolbarIcon: View {
    private let icon: YiruIconID

    init(_ icon: YiruIconID) {
        self.icon = icon
    }

    var body: some View {
        // Why: toolbar buttons inherit the app's neutral foreground/tint. Setting a local
        // UIColor here makes the same Hugeicon look darker than adjacent controls in a glass
        // group and bypasses the appearance-aware button contrast chosen by SwiftUI.
        // Why: a 24pt glyph inside a 44pt target. Holding that footprint for every header
        // action keeps the Hugeicons outline from visually overpowering the shared Home
        // toolbar circles.
        YiruIcon(icon, size: 24)
    }
}

extension Label where Title == Text, Icon == YiruIcon {
    init(_ title: LocalizedStringKey, iconID: YiruIconID) {
        self.init {
            Text(title)
        } icon: {
            YiruIcon(iconID)
        }
    }

    init(_ title: String, iconID: YiruIconID) {
        self.init {
            Text(verbatim: title)
        } icon: {
            YiruIcon(iconID)
        }
    }
}

extension Button where Label == YiruIconButtonLabel {
    init(
        _ title: LocalizedStringKey,
        iconID: YiruIconID,
        role: ButtonRole? = nil,
        action: @escaping () -> Void
    ) {
        self.init(role: role, action: action) {
            YiruIconButtonLabel(title: title, icon: iconID)
        }
    }

    init(
        _ title: String,
        iconID: YiruIconID,
        role: ButtonRole? = nil,
        action: @escaping () -> Void
    ) {
        self.init(role: role, action: action) {
            YiruIconButtonLabel(title: LocalizedStringKey(title), icon: iconID)
        }
    }
}

struct YiruIconButtonLabel: View {
    let title: LocalizedStringKey
    let icon: YiruIconID

    var body: some View {
        Label {
            Text(title)
        } icon: {
            YiruIcon(icon)
        }
    }
}
