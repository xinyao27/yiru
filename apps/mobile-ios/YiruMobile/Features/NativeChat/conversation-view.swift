import SwiftUI

struct NativeChatConversationView: View {
    @Bindable var model: NativeChatModel
    @Bindable var interaction: NativeChatInteractionModel
    @Bindable var terminal: TerminalLiveModel
    let tab: TerminalWorkspaceTab
    let topChrome: TerminalTabStrip?
    var hostConnectionIsReady = true
    @State private var isAtBottom = true
    @State private var fontScale: CGFloat = 1
    @State private var gestureStartScale: CGFloat = 1
    @State private var dismissedAsk: NativeChatAskPrompt?
    @State private var promptCancellationRevision = 0

    var body: some View {
        let timeline = makeTimeline()
        VStack(spacing: 0) {
            if let topChrome { topChrome }
            transcript(timeline: timeline)
                .frame(minHeight: 0, maxHeight: .infinity)
        }
        .background(Theme.Colors.background)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                if let notice = terminal.actionNotice {
                    TerminalActionNoticeLabel(message: notice.message)
                        .padding(.bottom, 4)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
                if let prompt = visiblePrompt {
                    NativeChatPromptCard(
                        prompt: prompt,
                        agent: tab.nativeChatAgent,
                        send: sendControl,
                        acceptAsk: dismissCurrentAsk,
                        cancelRevision: promptCancellationRevision
                    )
                }
                if let notice = interaction.notice {
                    Text(notice)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, 4)
                        .transition(.opacity)
                }
                NativeChatComposer(
                    text: $model.draft,
                    isWorking: tab.agentStatus?.isWorking == true,
                    isEnabled: terminal.canAcceptUserInput,
                    isSending: model.isSending,
                    sendError: model.sendError,
                    isAttaching: interaction.isAttaching,
                    filePaths: interaction.filePaths,
                    requestFiles: interaction.requestFiles,
                    attach: attachImage,
                    attachmentFailed: interaction.reportAttachmentFailure,
                    send: sendMessage,
                    stop: {
                        promptCancellationRevision &+= 1
                        terminal.stopAgent(baseline: tab.agentStatus?.interruptBaseline)
                    }
                )
            }
            .background(Theme.Colors.background.opacity(0.94))
        }
        .overlay(alignment: .top) {
            TerminalConnectionStatusBanner(
                model: terminal,
                hostConnectionIsReady: hostConnectionIsReady
            )
            .padding(.horizontal, TerminalChromeMetrics.horizontalInset)
            .padding(.top, Theme.Spacing.small)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
        .task(id: transcriptIdentity) {
            await model.observe(
                agent: tab.nativeChatAgent,
                sessionID: tab.agentStatus?.providerSession?.id,
                transcriptPath: tab.agentStatus?.providerSession?.transcriptPath
            )
        }
        .onChange(of: currentAsk) { _, ask in
            if ask == nil { dismissedAsk = nil }
        }
    }

    private var prompt: NativeChatInteractivePrompt? {
        NativeChatPromptParser.parse(tab.agentStatus, messages: model.messages)
    }

    private var currentAsk: NativeChatAskPrompt? {
        guard case .ask(let ask) = prompt else { return nil }
        return ask
    }

    private var visiblePrompt: NativeChatInteractivePrompt? {
        guard let prompt else { return nil }
        if case .ask(let ask) = prompt, ask == dismissedAsk { return nil }
        return prompt
    }

    private func dismissCurrentAsk() {
        dismissedAsk = currentAsk
    }

    private func transcript(timeline: [NativeChatTimelineRow]) -> some View {
        ScrollViewReader { proxy in
            ZStack(alignment: .bottom) {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        if model.hasMore {
                            Button {
                                Task { await model.loadEarlier() }
                            } label: {
                                if model.isLoadingEarlier {
                                    ProgressView()
                                        .controlSize(.small)
                                } else {
                                    Text("Load earlier messages")
                                }
                            }
                            .buttonStyle(.glass)
                            .appButtonContext(.inline)
                            .disabled(model.isLoadingEarlier)
                            .padding(.vertical, 12)
                        }
                        if timeline.isEmpty {
                            emptyState
                                .containerRelativeFrame(.vertical)
                        }
                        ForEach(timeline) { row in
                            NativeChatMessageRow(
                                message: row.message,
                                isQueued: row.isQueued,
                                fontScale: fontScale,
                                openFile: openFile
                            )
                        }
                        Color.clear.frame(height: 1).id("native-chat-tail")
                    }
                }
                .defaultScrollAnchor(.bottom)
                .simultaneousGesture(
                    MagnifyGesture()
                        .onChanged { value in
                            fontScale = min(
                                1.8, max(0.8, gestureStartScale * value.magnification))
                        }
                        .onEnded { _ in gestureStartScale = fontScale }
                )
                .onScrollGeometryChange(for: Bool.self) { geometry in
                    geometry.contentOffset.y + geometry.containerSize.height
                        >= geometry.contentSize.height - 80
                } action: { _, next in
                    isAtBottom = next
                }
                if !isAtBottom, !timeline.isEmpty {
                    GlassIconButton(
                        iconName: .arrowDown,
                        accessibilityLabel: "Scroll to latest",
                        context: .inline
                    ) {
                        withAnimation(Theme.Motion.stateChange) {
                            proxy.scrollTo("native-chat-tail", anchor: .bottom)
                        }
                    }
                    .padding(.bottom, 8)
                }
            }
            .onChange(of: timelineTailKey(timeline)) { _, _ in
                guard isAtBottom else { return }
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(60))
                    proxy.scrollTo("native-chat-tail", anchor: .bottom)
                }
            }
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: 4) {
            Text(emptyTitle)
                .font(.system(size: 14, weight: .semibold))
            Text(emptyDetail)
                .font(.system(size: 12))
        }
        .foregroundStyle(Theme.Colors.mutedForeground)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }

    private func makeTimeline() -> [NativeChatTimelineRow] {
        var rows = model.foldedMessages.map {
            NativeChatTimelineRow(message: $0, isQueued: false)
        }
        if let streamingMessage { rows.append(.init(message: streamingMessage, isQueued: false)) }
        rows.append(
            contentsOf: model.queuedMessages.map { pending in
                NativeChatTimelineRow(
                    message: NativeChatMessage(
                        id: pending.id,
                        role: .user,
                        blocks: [.text(pending.text)],
                        timestamp: nil,
                        source: .transcript,
                        turnID: nil
                    ),
                    isQueued: true
                )
            })
        return rows
    }

    private var streamingMessage: NativeChatMessage? {
        guard tab.agentStatus?.isWorking == true,
            let text = tab.agentStatus?.lastAssistantMessage?.trimmingCharacters(
                in: .whitespacesAndNewlines),
            !text.isEmpty
        else { return nil }
        let lastAssistant =
            model.messages.last(where: { $0.role == .assistant })?.plainText
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !lastAssistant.hasPrefix(text) else { return nil }
        return NativeChatMessage(
            id: "native-chat-streaming",
            role: .assistant,
            blocks: [.text(text)],
            timestamp: nil,
            source: .hook,
            turnID: nil
        )
    }

    private var transcriptIdentity: String {
        [
            tab.nativeChatAgent ?? "",
            tab.agentStatus?.providerSession?.id ?? "",
            tab.agentStatus?.providerSession?.transcriptPath ?? "",
        ].joined(separator: "\u{0000}")
    }

    private func timelineTailKey(_ timeline: [NativeChatTimelineRow]) -> String {
        let last = timeline.last?.message
        return "\(timeline.count):\(last?.id ?? ""):\(last?.plainText.count ?? 0)"
    }

    private var emptyTitle: LocalizedStringResource {
        switch model.phase {
        case .failed: "Chat unavailable"
        case .waiting, .ready, .loading: "Start a conversation"
        }
    }

    private var emptyDetail: String {
        switch model.phase {
        case .failed(let message): message
        case .waiting:
            String(localized: "Waiting for \(agentLabel) to start a session.")
        case .loading, .ready:
            String(localized: "Send a message to \(agentLabel).")
        }
    }

    private var agentLabel: String {
        switch tab.nativeChatAgent {
        case "claude", "openclaude": "Claude"
        case "codex": "Codex"
        case "grok": "Grok"
        default: String(localized: "the agent")
        }
    }

    private func sendMessage() {
        let value = model.draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        guard let origin = model.beginSend(value) else {
            model.markSendFailure(String(localized: "Message not sent — reconnecting…"))
            return
        }
        Task { @MainActor in
            let sendInput: (String) async -> TerminalInputDeliveryOutcome = { value in
                await terminal.sendChatMessageConfirmed(value, enter: false)
            }
            guard await interaction.healStaleInput(terminalID: terminal.identifier, send: sendInput)
            else {
                model.markSendFailure(String(localized: "Message not sent — reconnecting…"))
                model.finishSend(origin)
                return
            }
            let includedPastedImage = interaction.beginChatSend(terminalID: terminal.identifier)
            let outcome = await terminal.sendChatMessageConfirmed(value)
            interaction.recordChatSendOutcome(
                terminalID: terminal.identifier,
                includedPastedImage: includedPastedImage,
                outcome: outcome
            )
            switch outcome {
            case .accepted:
                model.markSendFailure(nil)
                model.acceptSend(origin)
            case .rejected:
                model.markSendFailure(String(localized: "Message not sent — reconnecting…"))
            case .unknown:
                model.holdUnconfirmedSend(origin)
                model.markSendFailure(nil)
            }
            model.finishSend(origin)
        }
    }

    private func sendControl(_ value: String, _ enter: Bool) async -> Bool {
        let outcome = await terminal.sendChatMessageConfirmed(value, enter: enter)
        switch outcome {
        case .accepted:
            model.markSendFailure(nil)
            return true
        case .rejected:
            model.markSendFailure(String(localized: "Response not sent — reconnecting…"))
            return false
        case .unknown:
            model.markSendFailure(String(localized: "Response not sent — reconnecting…"))
            return false
        }
    }

    private func attachImage(_ data: Data) {
        interaction.attachImage(data, terminalID: terminal.identifier) { payload in
            await terminal.sendChatMessageConfirmed(payload, enter: false)
        }
    }

    private func openFile(_ path: String) {
        interaction.openFile(path, terminalID: terminal.identifier)
    }

}

nonisolated private struct NativeChatTimelineRow: Identifiable {
    let message: NativeChatMessage
    let isQueued: Bool
    var id: String { message.id }
}
