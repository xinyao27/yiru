import SwiftUI
import UIKit

struct NativeChatMessageRow: View {
    let message: NativeChatMessage
    var isQueued = false
    var fontScale: CGFloat = 1
    var openFile: (String) -> Void = { _ in }
    @State private var isCopied = false
    @State private var isToolDetailPresented = false

    var body: some View {
        let proseBlocks = message.blocks.filter { block in
            switch block {
            case .text, .image: true
            case .toolCall, .toolResult: false
            }
        }
        let toolBlocks = message.blocks.filter { block in
            switch block {
            case .toolCall, .toolResult: true
            case .text, .image: false
            }
        }
        VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
            if isQueued {
                Text("Queued")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(proseBlocks.enumerated()), id: \.offset) { _, block in
                    prose(block)
                }
                if !toolBlocks.isEmpty {
                    Button {
                        isToolDetailPresented = true
                    } label: {
                        Text(nativeChatToolSummary(toolBlocks))
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                            .frame(minHeight: 30, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Show details")
                }
                if message.role != .user, !message.plainText.isEmpty, !isQueued {
                    GlassIconButton(
                        iconName: isCopied ? .check : .copy,
                        accessibilityLabel: "Copy message",
                        context: .inline,
                        action: copyMessage
                    )
                }
            }
            .padding(.horizontal, message.role == .user ? 12 : 0)
            .padding(.vertical, message.role == .user ? 8 : 0)
            .frame(maxWidth: message.role == .user ? 350 : .infinity, alignment: .leading)
            .background {
                if message.role == .user {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Theme.Colors.primary)
                } else if isCopied {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Theme.Colors.diffInserted)
                }
            }
            .opacity(message.role == .reasoning || isQueued ? 0.7 : 1)
        }
        .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .sheet(isPresented: $isToolDetailPresented) {
            NativeChatToolDetailSheet(blocks: toolBlocks, openFile: openFile)
        }
        .environment(
            \.openURL,
            OpenURLAction { url in
                guard url.scheme?.lowercased() == "yiru-file" else { return .systemAction }
                let rawPath = String(url.absoluteString.dropFirst("yiru-file://".count))
                openFile(rawPath.removingPercentEncoding ?? rawPath)
                return .handled
            })
    }

    @ViewBuilder
    private func prose(_ block: NativeChatBlock) -> some View {
        switch block {
        case .text(let text):
            if message.role == .user {
                Text(text)
                    .font(.system(size: 17 * fontScale, weight: .medium))
                    .foregroundStyle(Theme.Colors.background)
                    .lineSpacing(5)
                    .textSelection(.enabled)
            } else {
                AppStructuredMarkdown(
                    content: linkifyNativeChatFilePaths(text),
                    fontSize: 17 * fontScale
                )
            }
        case .image(let path, let url, let alt):
            HStack(spacing: 4) {
                YiruIcon(.photo, size: 15)
                Text(alt ?? path ?? url ?? String(localized: "image"))
                    .lineLimit(1)
            }
            .font(.system(size: 14))
            .foregroundStyle(
                message.role == .user ? Theme.Colors.background : Theme.Colors.mutedForeground
            )
        case .toolCall, .toolResult:
            EmptyView()
        }
    }

    private func copyMessage() {
        UIPasteboard.general.string = message.plainText
        isCopied = true
        Task {
            try? await Task.sleep(for: .milliseconds(700))
            isCopied = false
        }
    }
}

private struct NativeChatToolDetailSheet: View {
    let blocks: [NativeChatBlock]
    let openFile: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let maximumDiffLines = max(1, 240 / max(1, blocks.count))
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                        ContentSurface {
                            switch block {
                            case .toolCall(let name, let input, let callID):
                                Button {
                                    if let path = input.filePath {
                                        dismiss()
                                        openFile(path)
                                    }
                                } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Label(name, iconID: .wrench)
                                            .font(.system(size: 14, weight: .semibold))
                                        if !input.summary.isEmpty {
                                            Text(input.summary)
                                                .font(.system(size: 12))
                                                .foregroundStyle(Theme.Colors.mutedForeground)
                                                .lineLimit(1)
                                        }
                                    }
                                }
                                .buttonStyle(.plain)
                                .disabled(input.filePath == nil)
                                if let callID {
                                    Text(callID)
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundStyle(Theme.Colors.mutedForeground)
                                }
                                if let diff = NativeChatToolDiff.fromToolCall(
                                    name: name,
                                    input: input,
                                    maximumLines: maximumDiffLines
                                ) {
                                    NativeChatToolDiffView(lines: diff, filePath: input.filePath)
                                } else if !input.formatted.isEmpty {
                                    Text(input.formatted)
                                        .font(.system(size: 12, design: .monospaced))
                                        .textSelection(.enabled)
                                }
                            case .toolResult(let output, let isError, _, let segments):
                                Label(
                                    isError ? "Tool error" : "Tool result",
                                    iconID: isError ? .warning : .check
                                )
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(
                                    isError ? Theme.Colors.attention : Theme.Colors.foreground)
                                if let diff = NativeChatToolDiff.fromText(
                                    output,
                                    maximumLines: maximumDiffLines
                                ) {
                                    NativeChatToolDiffView(lines: diff, filePath: nil)
                                } else {
                                    Text(
                                        visibleToolOutput(
                                            (segments ?? [output]).joined(separator: "\n"))
                                    )
                                    .font(.system(size: 12, design: .monospaced))
                                    .textSelection(.enabled)
                                }
                            case .text, .image:
                                EmptyView()
                            }
                        }
                    }
                }
                .padding(16)
            }
            .background(Theme.Colors.background)
            .navigationTitle(Text("Tool activity"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(
                    accessibilityLabel: "Close tool activity",
                    action: dismiss.callAsFunction
                )
            }
        }
        .appSheetPresentation(.page)
    }
}

private struct NativeChatToolDiffView: View {
    let lines: [NativeChatToolDiffLine]
    let filePath: String?

    var body: some View {
        let inlineSegments = makeInlineSegments()
        ScrollView(.horizontal) {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(lines) { line in
                    HStack(alignment: .top, spacing: 0) {
                        NativeChatDiffIndicator(kind: line.kind)
                            .frame(width: YiruDiffCodeLayout.indicatorWidth)
                        YiruDiffSyntaxText(
                            text: line.text,
                            filePath: filePath,
                            inlineSegments: inlineSegments[line.id],
                            emphasisColor: emphasis(line.kind)
                        )
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, YiruDiffCodeLayout.codeHorizontalPadding)
                    }
                    .font(.system(size: YiruDiffCodeLayout.codeFontSize, design: .monospaced))
                    .frame(
                        maxWidth: .infinity, minHeight: YiruDiffCodeLayout.minimumLineHeight,
                        alignment: .leading
                    )
                    .background(background(line.kind))
                }
            }
        }
        .background(Theme.Colors.diffCodeCanvas, in: .rect(cornerRadius: 8))
    }

    private func makeInlineSegments() -> [Int: [YiruDiffInlineSegment]] {
        var result: [Int: [YiruDiffInlineSegment]] = [:]
        var cursor = 0
        while cursor < lines.count {
            guard lines[cursor].kind == .delete else {
                cursor += 1
                continue
            }
            let deletionStart = cursor
            while cursor < lines.count, lines[cursor].kind == .delete { cursor += 1 }
            let deletionEnd = cursor
            let additionStart = cursor
            while cursor < lines.count, lines[cursor].kind == .add { cursor += 1 }
            let pairCount = min(deletionEnd - deletionStart, cursor - additionStart)
            for offset in 0..<pairCount {
                let deleted = lines[deletionStart + offset]
                let added = lines[additionStart + offset]
                result[deleted.id] = YiruInlineDiff.segments(
                    deleted.text,
                    comparedWith: added.text
                )
                result[added.id] = YiruInlineDiff.segments(
                    added.text,
                    comparedWith: deleted.text
                )
            }
        }
        return result
    }

    private func emphasis(_ kind: NativeChatToolDiffLineKind) -> Color? {
        switch kind {
        case .add: Theme.Colors.diffCodeAddedEmphasis
        case .delete: Theme.Colors.diffCodeDeletedEmphasis
        case .metadata, .context: nil
        }
    }

    private func background(_ kind: NativeChatToolDiffLineKind) -> Color {
        switch kind {
        case .add: Theme.Colors.diffCodeAdded
        case .delete: Theme.Colors.diffCodeDeleted
        case .context, .metadata: Theme.Colors.diffCodeContext
        }
    }
}

private struct NativeChatDiffIndicator: View {
    let kind: NativeChatToolDiffLineKind

    var body: some View {
        switch kind {
        case .add:
            Rectangle().fill(Theme.Colors.diffCodeAddedGutter)
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
                        with: .color(Theme.Colors.diffCodeDeletedGutter)
                    )
                    y += 2
                }
            }
        case .context, .metadata:
            Color.clear
        }
    }
}

nonisolated private func visibleToolOutput(_ value: String) -> String {
    value.count <= 4_000 ? value : String(value.prefix(4_000)) + "…"
}
