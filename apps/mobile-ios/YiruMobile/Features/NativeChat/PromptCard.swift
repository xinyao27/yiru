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
            VStack(alignment: .leading, spacing: Theme.Spacing.small) {
                Text(prompt.title)
                    .font(.system(size: Theme.Typography.supporting, weight: .semibold))
                if let detail = prompt.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineSpacing(Theme.Spacing.extraSmall)
                }
                GlassEffectContainer(spacing: Theme.Glass.groupSpacing) {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: Theme.Spacing.small) {
                            ForEach(prompt.options, id: \.self) { option in
                                optionButton(
                                    option,
                                    isPrimary: option == prompt.options.first,
                                    fillsWidth: false
                                )
                            }
                        }
                        VStack(spacing: Theme.Spacing.small) {
                            ForEach(prompt.options, id: \.self) { option in
                                optionButton(
                                    option,
                                    isPrimary: option == prompt.options.first,
                                    fillsWidth: true
                                )
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.standard)
        .padding(.vertical, Theme.Spacing.small)
        .onChange(of: cancelRevision) { _, _ in cancelSubmission() }
        .onDisappear { cancelSubmission() }
    }

    @ViewBuilder
    private func optionButton(
        _ option: NativeChatPermissionOption,
        isPrimary: Bool,
        fillsWidth: Bool
    ) -> some View {
        if isPrimary {
            Button {
                respond(option)
            } label: {
                Text(option.label)
                    .padding(.horizontal, Theme.Spacing.small)
                    .fixedSize(horizontal: !fillsWidth, vertical: false)
                    .frame(maxWidth: fillsWidth ? .infinity : nil)
            }
            .appProminentGlassButton()
            .appButtonContext(.regular)
            .disabled(isSubmitting)
        } else {
            Button {
                respond(option)
            } label: {
                Text(option.label)
                    .padding(.horizontal, Theme.Spacing.small)
                    .fixedSize(horizontal: !fillsWidth, vertical: false)
                    .frame(maxWidth: fillsWidth ? .infinity : nil)
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
            VStack(alignment: .leading, spacing: Theme.Spacing.small) {
                Label(prompt.question, iconID: .info)
                    .font(.system(size: Theme.Typography.supporting, weight: .semibold))
                ForEach(prompt.options.indices, id: \.self) { index in
                    Button {
                        if prompt.isMultiple {
                            if !selected.insert(index).inserted { selected.remove(index) }
                        } else {
                            submit(optionAt: index)
                        }
                    } label: {
                        HStack(spacing: Theme.Spacing.small) {
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
                                .font(.system(size: Theme.Typography.supporting))
                                .foregroundStyle(Theme.Colors.foreground)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, Theme.Spacing.medium)
                        .frame(minHeight: Theme.Size.minimumHitTarget)
                        .contentShape(.rect(cornerRadius: Theme.Radius.control))
                    }
                    .buttonStyle(.appPlain)
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
                HStack(alignment: .bottom, spacing: Theme.Spacing.small) {
                    TextField("Or type a reply…", text: $reply, axis: .vertical)
                        .lineLimit(1...4)
                        .padding(.horizontal, Theme.Spacing.medium)
                        .frame(minHeight: Theme.Size.minimumHitTarget)
                        .glassEffect(
                            .regular.interactive(),
                            in: .rect(cornerRadius: Theme.Radius.control)
                        )
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
        .padding(.horizontal, Theme.Spacing.standard)
        .padding(.vertical, Theme.Spacing.small)
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
