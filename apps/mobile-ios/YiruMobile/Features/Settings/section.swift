import SwiftUI

struct SettingsSection<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(spacing: 0) {
            content
        }
        .background(Theme.Colors.content)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            // Why: MobileContentSection keeps the semantic border around each card. Applying
            // it after clipping preserves the same continuous 1px edge without changing the
            // fill or making the row separators darker.
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Theme.Colors.divider, lineWidth: 1.0 / 3.0)
        }
    }
}

struct SettingsDivider: View {
    var emphasized = false

    var body: some View {
        Rectangle()
            .fill(emphasized ? Theme.Colors.settingsDivider : Theme.Colors.divider)
            // Why: one physical pixel on the 3x iPhone target. A half-point rule rounds to
            // two pixels on alternating rows, so a long settings list slowly drifts.
            .frame(height: 1.0 / 3.0)
            .padding(.horizontal, 12)
    }
}

struct SettingsHeading: View {
    let title: LocalizedStringResource
    var detail: LocalizedStringResource? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.system(size: Theme.Typography.metadata, weight: .semibold))
                .tracking(0.4)
            if let detail {
                Text(detail)
                    .font(.system(size: Theme.Typography.metadata))
                    .lineSpacing(4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .allowsTightening(true)
                    .minimumScaleFactor(0.9)
            }
        }
        .foregroundStyle(Theme.Colors.mutedForeground)
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SettingsNavigationRow: View {
    let title: LocalizedStringResource
    let glyph: YiruIconID
    var trailing: LocalizedStringResource? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                YiruIcon(glyph, size: 16)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: 20)
                Text(title)
                    .font(.system(size: Theme.Typography.supporting))
                    .lineSpacing(3)
                    .foregroundStyle(Theme.Colors.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let trailing {
                    Text(trailing)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
                YiruIcon(.chevronRight, size: 16)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: 20)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: SettingsMetrics.rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct SettingsLinkRow: View {
    let title: LocalizedStringResource
    let glyph: YiruIconID
    let destination: URL

    var body: some View {
        Link(destination: destination) {
            HStack(spacing: 8) {
                YiruIcon(glyph, size: 16)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: 20)
                Text(title)
                    .font(.system(size: Theme.Typography.supporting))
                    .lineSpacing(3)
                    .foregroundStyle(Theme.Colors.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: SettingsMetrics.rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private enum SettingsMetrics {
    // Why: 44pt, which is also what a 15pt text line plus 12pt vertical padding resolves to.
    // Pinning it keeps the last row from drifting a pixel after six separators.
    static let rowHeight: CGFloat = 44
}

/// Why: shared vertical rhythm for every screen in the Settings cluster (including Terminal's
/// preferences screen) so a heading's gap to its control, and the gap between stacked sections,
/// reads identically no matter which settings screen it appears on.
enum SettingsSpacing {
    static let headingToContent: CGFloat = 8
    static let betweenSections: CGFloat = 24
}
