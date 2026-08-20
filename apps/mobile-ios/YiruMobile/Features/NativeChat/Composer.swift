import SwiftUI

struct NativeChatComposer: View {
    @Binding var text: String
    let isWorking: Bool
    let isEnabled: Bool
    let isSending: Bool
    let sendError: String?
    let isAttaching: Bool
    var filePaths: [String] = []
    var requestFiles: (String) -> Void = { _ in }
    let attach: (Data) -> Void
    let attachmentFailed: (String) -> Void
    let send: () -> Void
    let stop: () -> Void
    @FocusState private var isFocused: Bool
    @State private var textSelection: TextSelection?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            if !suggestions.isEmpty { suggestionsView }
            if isWorking {
                HStack(spacing: Theme.Spacing.small) {
                    YiruLoader(
                        size: 20
                    )
                    Text("Working")
                        .font(.system(size: Theme.Typography.supporting, weight: .regular))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
                .frame(minHeight: Theme.Control.largeHeight)
                .padding(.horizontal, Theme.Spacing.medium)
                .transition(.opacity)
            }
            if let sendError {
                Text(sendError)
                    .font(.system(size: Theme.Typography.metadata, weight: .regular))
                    .foregroundStyle(Theme.Colors.attention)
                    .frame(maxWidth: .infinity)
            }
            GlassEffectContainer(spacing: Theme.Glass.groupSpacing) {
                HStack(alignment: .bottom, spacing: Theme.Spacing.small) {
                    NativeChatAttachmentPicker(
                        isDisabled: !isEnabled,
                        isPending: isAttaching,
                        picked: attach,
                        failed: attachmentFailed
                    )
                    HStack(alignment: .bottom, spacing: 0) {
                        TextField(
                            placeholder,
                            text: $text,
                            selection: $textSelection,
                            axis: .vertical
                        )
                        .focused($isFocused)
                        .lineLimit(1...5)
                        .font(.system(size: Theme.Typography.primary))
                        .padding(.leading, Theme.Spacing.standard)
                        .padding(.vertical, 9)
                        .padding(
                            .trailing,
                            isWorking
                                || !text.trimmingCharacters(
                                    in: .whitespacesAndNewlines
                                ).isEmpty ? 0 : 16
                        )
                        .frame(minHeight: 44)
                        .disabled(!isEnabled)
                        .submitLabel(.send)
                        .onSubmit {
                            if canSend { send() }
                        }
                        .onChange(of: text) { _, _ in requestFileSuggestions() }

                        if isWorking {
                            ProminentCircleButton(
                                iconName: .stop,
                                accessibilityLabel: "Stop the agent",
                                context: .inline,
                                // Why: Stop stays actionable while the terminal is reconnecting
                                // so the user gets explicit failure feedback instead of losing
                                // the only escape hatch for a stuck agent.
                                isDisabled: false,
                                action: stop
                            )
                        } else if isSending
                            || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        {
                            if isSending {
                                YiruLoader(size: Theme.Control.inlineIcon)
                                    .frame(
                                        width: Theme.Size.minimumHitTarget,
                                        height: Theme.Size.minimumHitTarget
                                    )
                                    .accessibilityLabel("Sending message")
                            } else {
                                ProminentCircleButton(
                                    iconName: .arrowUp,
                                    accessibilityLabel: "Send message",
                                    context: .inline,
                                    isDisabled: !canSend,
                                    action: send
                                )
                            }
                        }
                    }
                    .glassEffect(.regular.interactive(), in: .capsule)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.medium)
        .padding(.bottom, Theme.Spacing.small)
        .animation(Theme.Motion.stateChange, value: isWorking)
    }

    private var suggestionsView: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        apply(suggestion, to: trigger)
                    } label: {
                        Text(suggestion)
                            .font(.system(size: Theme.Typography.code, design: .monospaced))
                            .foregroundStyle(Theme.Colors.foreground)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            .padding(.horizontal, Theme.Spacing.medium)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .frame(maxHeight: 176)
        .background(
            Theme.Colors.content,
            in: RoundedRectangle(cornerRadius: Theme.Radius.content, style: .continuous)
        )
    }

    private var placeholder: LocalizedStringResource {
        isEnabled ? "Message" : "Waiting for terminal…"
    }

    private var canSend: Bool {
        isEnabled && !isAttaching && !isSending
            && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var suggestions: [String] {
        guard let trigger else { return [] }
        let candidates = trigger.kind == .slash ? slashCommands : filePaths
        let ranked = rankSuggestions(candidates, query: trigger.query)
        return trigger.kind == .file ? ranked.map { "@\($0)" } : ranked
    }

    private var trigger: AutocompleteTrigger? {
        let cursor = cursorOffset
        var triggerStart = cursor
        while triggerStart > 0 {
            let index = text.index(text.startIndex, offsetBy: triggerStart - 1)
            guard !text[index].isWhitespace else { break }
            triggerStart -= 1
        }
        guard triggerStart < cursor else { return nil }
        let triggerIndex = text.index(text.startIndex, offsetBy: triggerStart)
        let triggerCharacter = text[triggerIndex]
        guard triggerCharacter == "@" || triggerCharacter == "/" else { return nil }
        if triggerCharacter == "/", triggerStart != 0 { return nil }
        if triggerCharacter == "@", triggerStart > 0 {
            let before = text.index(text.startIndex, offsetBy: triggerStart - 1)
            guard text[before].isWhitespace else { return nil }
        }
        let queryStart = text.index(after: triggerIndex)
        let queryEnd = text.index(text.startIndex, offsetBy: cursor)
        let query = String(text[queryStart..<queryEnd])
        guard !query.contains(where: \.isWhitespace) else { return nil }
        return AutocompleteTrigger(
            kind: triggerCharacter == "/" ? .slash : .file,
            query: query,
            start: triggerStart,
            end: cursor
        )
    }

    private var cursorOffset: Int {
        guard let textSelection else { return text.count }
        guard case .selection(let range) = textSelection.indices else { return text.count }
        // Why: TextField can publish a selection from the previous value for one render after
        // the bound text changes. Never ask String to measure an index that no longer belongs to
        // the current value; the end of the current text is the safe autocomplete fallback.
        guard range.upperBound >= text.startIndex,
            range.upperBound <= text.endIndex,
            text.indices.contains(range.upperBound)
        else { return text.count }
        return text.distance(from: text.startIndex, to: range.upperBound)
    }

    private func requestFileSuggestions() {
        guard let trigger, trigger.kind == .file else { return }
        requestFiles(trigger.query)
    }

    private func apply(_ suggestion: String, to trigger: AutocompleteTrigger?) {
        guard let trigger else { return }
        let start = text.index(text.startIndex, offsetBy: trigger.start)
        let end = text.index(text.startIndex, offsetBy: trigger.end)
        let inserted = suggestion + " "
        text.replaceSubrange(start..<end, with: inserted)
        textSelection = TextSelection(
            insertionPoint: text.index(text.startIndex, offsetBy: trigger.start + inserted.count)
        )
        isFocused = true
    }

    private func rankSuggestions(_ candidates: [String], query: String) -> [String] {
        let normalizedQuery = query.lowercased()
        if normalizedQuery.isEmpty { return Array(candidates.prefix(8)) }
        var prefixMatches: [String] = []
        var substringMatches: [String] = []
        for candidate in candidates {
            let normalizedCandidate = candidate.lowercased()
            let basename =
                normalizedCandidate.split(separator: "/").last.map(String.init)
                ?? normalizedCandidate
            if normalizedCandidate.hasPrefix(normalizedQuery)
                || basename.hasPrefix(normalizedQuery)
            {
                prefixMatches.append(candidate)
            } else if normalizedCandidate.contains(normalizedQuery) {
                substringMatches.append(candidate)
            }
            if prefixMatches.count >= 8 { break }
        }
        return Array((prefixMatches + substringMatches).prefix(8))
    }
}

nonisolated private struct AutocompleteTrigger {
    nonisolated enum Kind { case slash, file }
    let kind: Kind
    let query: String
    let start: Int
    let end: Int
}

nonisolated private let slashCommands = [
    "/clear", "/compact", "/review", "/model", "/help", "/init", "/cost", "/diff",
]
