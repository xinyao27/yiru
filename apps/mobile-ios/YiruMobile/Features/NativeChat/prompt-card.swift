import SwiftUI

struct NativeChatPromptCard: View {
    let prompt: NativeChatInteractivePrompt
    let agent: String?
    let send: (String, Bool) async -> Bool
    let acceptAsk: () -> Void
    let cancelRevision: Int

    var body: some View {
        switch prompt {
        case .ask(let ask):
            NativeChatAskWizard(
                prompt: ask,
                agent: agent,
                send: send,
                accepted: acceptAsk,
                cancelRevision: cancelRevision
            )
            .id(ask)
        case .permission(let permission):
            NativeChatPermissionCard(
                prompt: permission,
                send: send,
                cancelRevision: cancelRevision
            )
            .id(permission)
        case .choice(let choice):
            NativeChatChoiceCard(
                prompt: choice,
                send: send,
                cancelRevision: cancelRevision
            )
            .id(choice)
        }
    }
}

private struct NativeChatPermissionCard: View {
    let prompt: NativeChatPermissionPrompt
    let send: (String, Bool) async -> Bool
    let cancelRevision: Int
    @State private var isSubmitting = false
    @State private var submissionTask: Task<Void, Never>?

    var body: some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: 8) {
                Text(prompt.title)
                    .font(.system(size: 14, weight: .semibold))
                if let detail = prompt.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineSpacing(4)
                }
                GlassEffectContainer(spacing: 8) {
                    HStack(spacing: 8) {
                        ForEach(prompt.options, id: \.self) { option in
                            optionButton(option, isPrimary: option == prompt.options.first)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .onChange(of: cancelRevision) { _, _ in cancelSubmission() }
        .onDisappear { cancelSubmission() }
    }

    @ViewBuilder
    private func optionButton(_ option: NativeChatPermissionOption, isPrimary: Bool) -> some View {
        if isPrimary {
            Button {
                respond(option)
            } label: {
                Text(option.label)
                    .padding(.horizontal, 8)
            }
            .appProminentGlassButton()
            .appButtonContext(.regular)
            .disabled(isSubmitting)
        } else {
            Button {
                respond(option)
            } label: {
                Text(option.label)
                    .padding(.horizontal, 8)
            }
            .buttonStyle(.glass)
            .appButtonContext(.regular)
            .disabled(isSubmitting)
        }
    }

    private func respond(_ option: NativeChatPermissionOption) {
        guard submissionTask == nil else { return }
        isSubmitting = true
        submissionTask = Task { @MainActor in
            defer {
                submissionTask = nil
                if Task.isCancelled { isSubmitting = false }
            }
            guard !Task.isCancelled else { return }
            if !(await send(option.response, false)) {
                guard !Task.isCancelled else { return }
                isSubmitting = false
            }
        }
    }

    private func cancelSubmission() {
        submissionTask?.cancel()
        submissionTask = nil
        isSubmitting = false
    }
}

private struct NativeChatChoiceCard: View {
    let prompt: NativeChatChoicePrompt
    let send: (String, Bool) async -> Bool
    let cancelRevision: Int
    @State private var selected: Set<Int> = []
    @State private var reply = ""
    @State private var isSubmitting = false
    @State private var submissionTask: Task<Void, Never>?

    var body: some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: 8) {
                Label(prompt.question, iconID: .info)
                    .font(.system(size: 14, weight: .semibold))
                ForEach(prompt.options.indices, id: \.self) { index in
                    Button {
                        if prompt.isMultiple {
                            if !selected.insert(index).inserted { selected.remove(index) }
                        } else {
                            submit(optionAt: index)
                        }
                    } label: {
                        HStack(spacing: 8) {
                            if prompt.isMultiple {
                                YiruIcon(
                                    selected.contains(index) ? .checkboxChecked : .square, size: 17
                                )
                                .foregroundStyle(
                                    selected.contains(index)
                                        ? Theme.Colors.foreground : Theme.Colors.mutedForeground
                                )
                            }
                            Text(prompt.options[index])
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.Colors.foreground)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .contentShape(.rect(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    .disabled(isSubmitting)
                }
                if prompt.isMultiple {
                    Button {
                        submitSelection()
                    } label: {
                        Text("Submit (\(selected.count))")
                            .frame(maxWidth: .infinity)
                    }
                    .appProminentGlassButton()
                    .appButtonContext(.large)
                    .disabled(selected.isEmpty || isSubmitting)
                }
                HStack(alignment: .bottom, spacing: 8) {
                    TextField("Or type a reply…", text: $reply, axis: .vertical)
                        .lineLimit(1...4)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 14))
                    GlassIconButton(
                        iconName: .arrowUp,
                        accessibilityLabel: "Send reply",
                        context: .inline,
                        isDisabled: reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || isSubmitting,
                        action: submitReply
                    )
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .onChange(of: cancelRevision) { _, _ in cancelSubmission() }
        .onDisappear { cancelSubmission() }
    }

    private func submit(optionAt index: Int) {
        let value = prompt.optionTokens[index] ?? prompt.options[index]
        submit(value, clearReply: false)
    }

    private func submitSelection() {
        let values = selected.sorted().map { prompt.optionTokens[$0] ?? prompt.options[$0] }
        submit(values.joined(separator: ", "), clearReply: false)
    }

    private func submitReply() {
        let value = reply.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        submit(value, clearReply: true)
    }

    private func submit(_ value: String, clearReply: Bool) {
        guard submissionTask == nil else { return }
        isSubmitting = true
        submissionTask = Task { @MainActor in
            defer {
                submissionTask = nil
                if Task.isCancelled { isSubmitting = false }
            }
            guard !Task.isCancelled else { return }
            let accepted = await send(value, true)
            guard !Task.isCancelled else { return }
            if accepted {
                if clearReply { reply = "" }
            } else {
                isSubmitting = false
            }
        }
    }

    private func cancelSubmission() {
        submissionTask?.cancel()
        submissionTask = nil
        isSubmitting = false
    }
}
