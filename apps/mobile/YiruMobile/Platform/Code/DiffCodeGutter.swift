import SwiftUI

enum YiruDiffCodeLayout {
    // Why: review uses a compact editor gutter — a physical deletion/addition rail, a 36pt
    // line-number column, then the code. The terminal preview can still opt into the textual
    // +/- prefix below.
    static let indicatorWidth: CGFloat = 3
    static let prefixWidth: CGFloat = 20
    static let lineNumberWidth: CGFloat = 36
    static let lineNumberTrailing: CGFloat = 4
    static let dividerWidth: CGFloat = 1
    static let codeHorizontalPadding: CGFloat = 6
    static let codeFontSize: CGFloat = Theme.Typography.code
    static let minimumLineHeight: CGFloat = 20
    // Why: a compact 26pt code rhythm. The 44pt interaction target belongs to the note action,
    // not to every source line — stretching rows makes a short review diff unreadably sparse
    // on a phone.
    static let reviewLineHeight: CGFloat = 26
}

struct YiruDiffCodeGutter: View {
    let kind: WorkspaceDiffLine.Kind
    let lineNumber: String
    let tintPrefix: Bool
    let minimumHeight: CGFloat
    let isReview: Bool

    init(
        kind: WorkspaceDiffLine.Kind,
        lineNumber: String,
        tintPrefix: Bool = false,
        minimumHeight: CGFloat = YiruDiffCodeLayout.minimumLineHeight,
        isReview: Bool = false
    ) {
        self.kind = kind
        self.lineNumber = lineNumber
        self.tintPrefix = tintPrefix
        self.minimumHeight = minimumHeight
        self.isReview = isReview
    }

    var body: some View {
        HStack(spacing: 0) {
            if tintPrefix {
                Text(prefix)
                    .font(.system(size: YiruDiffCodeLayout.codeFontSize, design: .monospaced))
                    .foregroundStyle(
                        yiruDiffPrefixColor(kind, isReview: isReview)
                    )
                    .frame(width: YiruDiffCodeLayout.prefixWidth, alignment: .center)
            } else {
                YiruDiffIndicator(kind: kind, isReview: isReview)
                    .frame(width: YiruDiffCodeLayout.indicatorWidth)
            }
            Text(lineNumber)
                .font(.system(size: YiruDiffCodeLayout.codeFontSize, design: .monospaced))
                .foregroundStyle(
                    isReview ? Theme.Colors.reviewCodeComment : Theme.Colors.diffCodeComment
                )
                .frame(
                    width: YiruDiffCodeLayout.lineNumberWidth,
                    alignment: .trailing
                )
                .padding(.trailing, YiruDiffCodeLayout.lineNumberTrailing)
            Rectangle()
                .fill(
                    isReview
                        ? Theme.Colors.reviewCodeContext.opacity(0.9)
                        : Theme.Colors.diffCodeContext.opacity(0.9)
                )
                .frame(width: YiruDiffCodeLayout.dividerWidth)
        }
        // Why: wrapped mobile lines still represent one diff line. Stretch the rail to the full
        // row so a multi-line line never leaves a gap in Pierre's semantic gutter.
        .frame(
            minHeight: minimumHeight, maxHeight: .infinity, alignment: .top
        )
        .accessibilityHidden(true)
    }

    private var prefix: String {
        switch kind {
        case .context: " "
        case .add: "+"
        case .delete: "-"
        }
    }
}

private struct YiruDiffIndicator: View {
    let kind: WorkspaceDiffLine.Kind
    let isReview: Bool

    var body: some View {
        switch kind {
        case .context:
            Color.clear
        case .add:
            Rectangle().fill(
                isReview ? Theme.Colors.reviewCodeAddedGutter : Theme.Colors.diffCodeAddedGutter
            )
        case .delete:
            Canvas { context, size in
                var y: CGFloat = 0
                while y < size.height {
                    context.fill(
                        Path(
                            CGRect(
                                x: 0,
                                y: y,
                                width: size.width,
                                height: min(1, size.height - y)
                            )
                        ),
                        with: .color(
                            isReview
                                ? Theme.Colors.reviewCodeDeletedGutter
                                : Theme.Colors.diffCodeDeletedGutter
                        )
                    )
                    y += 2
                }
            }
        }
    }
}

func yiruDiffBackground(_ kind: WorkspaceDiffLine.Kind, isReview: Bool = false) -> Color {
    switch kind {
    case .context: isReview ? Theme.Colors.reviewCodeContext : Theme.Colors.diffCodeContext
    case .add: isReview ? Theme.Colors.reviewCodeAdded : Theme.Colors.diffCodeAdded
    case .delete: isReview ? Theme.Colors.reviewCodeDeleted : Theme.Colors.diffCodeDeleted
    }
}

func yiruDiffEmphasisColor(_ kind: WorkspaceDiffLine.Kind, isReview: Bool = false) -> Color? {
    switch kind {
    case .context: nil
    case .add:
        isReview ? Theme.Colors.reviewCodeAddedEmphasis : Theme.Colors.diffCodeAddedEmphasis
    case .delete:
        isReview ? Theme.Colors.reviewCodeDeletedEmphasis : Theme.Colors.diffCodeDeletedEmphasis
    }
}

func yiruDiffPrefixColor(_ kind: WorkspaceDiffLine.Kind, isReview: Bool = false) -> Color {
    switch kind {
    case .context:
        isReview ? Theme.Colors.reviewCodeComment : Theme.Colors.diffCodeComment
    case .add:
        isReview ? Theme.Colors.reviewCodeAddedGutter : Theme.Colors.diffCodeAddedGutter
    case .delete:
        isReview ? Theme.Colors.reviewCodeDeletedGutter : Theme.Colors.diffCodeDeletedGutter
    }
}
