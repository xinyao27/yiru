import SwiftUI

struct NativeChatAskWizard: View {
    let prompt: NativeChatAskPrompt
    let agent: String?
    let send: (String, Bool) async -> Bool
    let accepted: () -> Void
    let cancelRevision: Int
    @State private var step = 0
    @State private var selected: [Set<Int>]
    @State private var otherEnabled: Set<Int> = []
    @State private var otherText: [String]
    @State private var isSubmitting = false
    @State private var submissionTask: Task<Void, Never>?

    init(
        prompt: NativeChatAskPrompt,
        agent: String?,
        send: @escaping (String, Bool) async -> Bool,
        accepted: @escaping () -> Void,
        cancelRevision: Int
    ) {
        self.prompt = prompt
        self.agent = agent
        self.send = send
        self.accepted = accepted
        self.cancelRevision = cancelRevision
        _selected = State(initialValue: prompt.questions.map { _ in [] })
        _otherText = State(initialValue: prompt.questions.map { _ in "" })
    }

    var body: some View {
        VStack(spacing: 0) {
            if prompt.questions.count > 1 { stepPicker }
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    Text(question.question)
                        .font(.system(size: 14, weight: .semibold))
                        .padding(.vertical, 8)
                    ForEach(question.options.indices, id: \.self) { index in
                        optionRow(index: index)
                    }
                    otherRow
                    if otherEnabled.contains(step) {
                        TextField("Type your answer", text: otherBinding, axis: .vertical)
                            .lineLimit(1...4)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 44)
                            .glassEffect(
                                .regular.interactive(),
                                in: .rect(cornerRadius: Theme.Radius.control)
                            )
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            }
            controls
        }
        .frame(maxHeight: 384)
        .background(Theme.Colors.content)
        .clipShape(.rect(topLeadingRadius: 24, topTrailingRadius: 24))
        .padding(.top, 8)
        .onChange(of: cancelRevision) { _, _ in cancelSubmission() }
        .onDisappear { cancelSubmission() }
    }

    private var stepPicker: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(prompt.questions.indices, id: \.self) { index in
                    Button {
                        step = index
                    } label: {
                        HStack(spacing: 4) {
                            Text(
                                prompt.questions[index].header
                                    ?? String(localized: "Step \(index + 1)"))
                            if isAnswered(index) {
                                YiruIcon(.check)
                                    .foregroundStyle(Theme.Colors.success)
                            }
                        }
                        .font(.system(size: 12))
                        .foregroundStyle(
                            index == step ? Theme.Colors.foreground : Theme.Colors.mutedForeground
                        )
                        .padding(.horizontal, 12)
                        .frame(minHeight: 32)
                        .glassEffect(
                            index == step ? .regular.interactive() : .regular,
                            in: .capsule
                        )
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: Theme.Size.minimumHitTarget)
                    .contentShape(.rect)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .scrollIndicators(.hidden)
    }

    private func optionRow(index: Int) -> some View {
        Button {
            toggle(index)
        } label: {
            HStack(alignment: .top, spacing: 8) {
                YiruIcon(
                    selected[step].contains(index)
                        ? question.isMultiple ? .checkboxChecked : .circle
                        : question.isMultiple ? .square : .circle,
                    size: 17
                )
                .font(.system(size: 17))
                .foregroundStyle(
                    selected[step].contains(index)
                        ? Theme.Colors.success : Theme.Colors.mutedForeground
                )
                VStack(alignment: .leading, spacing: 2) {
                    Text(question.options[index].label)
                        .font(.system(size: 14))
                    if let detail = question.options[index].detail {
                        Text(detail)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(3)
                    }
                }
                Spacer(minLength: 0)
            }
            .foregroundStyle(Theme.Colors.foreground)
            .padding(8)
            .frame(minHeight: 44)
            .contentShape(.rect(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
    }

    private var otherRow: some View {
        Button {
            if otherEnabled.contains(step) {
                otherEnabled.remove(step)
            } else {
                otherEnabled.insert(step)
                if !question.isMultiple { selected[step] = [] }
            }
        } label: {
            HStack(spacing: 8) {
                YiruIcon(
                    otherEnabled.contains(step)
                        ? question.isMultiple ? .checkboxChecked : .circle
                        : question.isMultiple ? .square : .circle,
                    size: 17
                )
                .font(.system(size: 17))
                .foregroundStyle(
                    otherEnabled.contains(step)
                        ? Theme.Colors.success : Theme.Colors.mutedForeground
                )
                Text("Other…")
                    .font(.system(size: 14))
                Spacer(minLength: 0)
            }
            .foregroundStyle(Theme.Colors.foreground)
            .padding(8)
            .frame(minHeight: 44)
            .contentShape(.rect(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
    }

    private var controls: some View {
        GlassEffectContainer(spacing: 8) {
            HStack(spacing: 8) {
                Button("Cancel") {
                    isSubmitting = true
                    Task {
                        if await send("\u{001B}", false) {
                            accepted()
                        } else {
                            isSubmitting = false
                        }
                    }
                }
                .buttonStyle(.glass)
                .appButtonContext(.inline)
                .disabled(isSubmitting)
                if prompt.questions.count > 1 {
                    Spacer()
                    Text("\(step + 1)/\(prompt.questions.count)")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
                Spacer()
                Button(step == prompt.questions.count - 1 ? "Send answer" : "Next") {
                    advance()
                }
                .appProminentGlassButton()
                .appButtonContext(.inline)
                .disabled(!canAdvance || isSubmitting)
            }
            .padding(12)
        }
    }

    private var question: NativeChatAskQuestion { prompt.questions[step] }

    private var otherBinding: Binding<String> {
        Binding(get: { otherText[step] }, set: { otherText[step] = $0 })
    }

    private var canAdvance: Bool {
        if step == prompt.questions.count - 1 {
            return prompt.questions.indices.allSatisfy(isAnswered)
        }
        return isAnswered(step)
    }

    private func toggle(_ index: Int) {
        if question.isMultiple {
            if !selected[step].insert(index).inserted { selected[step].remove(index) }
        } else {
            selected[step] = selected[step].contains(index) ? [] : [index]
            otherEnabled.remove(step)
        }
    }

    private func isAnswered(_ index: Int) -> Bool {
        !selected[index].isEmpty
            || (otherEnabled.contains(index)
                && !otherText[index].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func advance() {
        guard step == prompt.questions.count - 1 else {
            step += 1
            return
        }
        guard submissionTask == nil else { return }
        isSubmitting = true
        let selections = prompt.questions.indices.map { index in
            NativeChatAskSelection(
                indices: selected[index].sorted(),
                other: otherEnabled.contains(index) ? otherText[index] : nil
            )
        }
        submissionTask = Task { @MainActor in
            defer {
                submissionTask = nil
                if Task.isCancelled { isSubmitting = false }
            }
            guard !Task.isCancelled else { return }
            let accepted = await NativeChatAskDelivery.send(
                prompt: prompt,
                selections: selections,
                agent: agent,
                write: send
            )
            guard !Task.isCancelled else { return }
            if accepted {
                self.accepted()
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
