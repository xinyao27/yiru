import SwiftUI

struct WorkspaceDiffCommentsPane: View {
    let lines: [WorkspaceDiffLine]
    let isTruncated: Bool
    let filePath: String
    let source: WorkspaceFileDiffSource
    @Bindable var model: WorkspaceDiffCommentsModel
    @State private var activeCommentLine: Int?
    @State private var commentDraft = ""

    var body: some View {
        VStack(spacing: 0) {
            WorkspaceDiffCommentsBar(model: model)
            GeometryReader { geometry in
                ScrollView([.horizontal, .vertical]) {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(YiruInlineDiff.renderLines(lines)) { renderedLine in
                            WorkspaceDiffCommentLine(
                                renderedLine: renderedLine,
                                filePath: filePath,
                                comments: comments(for: renderedLine.line),
                                activeCommentLine: activeCommentLine,
                                commentDraft: $commentDraft,
                                isBusy: model.isBusy,
                                startComment: startComment,
                                cancelComment: cancelComment,
                                saveComment: saveComment,
                                deleteComment: { comment in Task { await model.delete(comment) } }
                            )
                        }
                        if isTruncated {
                            Text("… diff truncated for mobile preview …")
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                .padding(
                                    .leading,
                                    YiruDiffCodeLayout.indicatorWidth
                                        + YiruDiffCodeLayout.prefixWidth
                                        + YiruDiffCodeLayout.lineNumberWidth
                                        + YiruDiffCodeLayout.lineNumberTrailing
                                        + YiruDiffCodeLayout.dividerWidth
                                        + YiruDiffCodeLayout.codeHorizontalPadding
                                )
                                .padding(.vertical, 4)
                        }
                    }
                    .frame(
                        minWidth: geometry.size.width,
                        minHeight: geometry.size.height,
                        alignment: .topLeading
                    )
                    .padding(.vertical, 8)
                }
                .background(Theme.Colors.diffCodeCanvas)
            }
        }
        .background(Theme.Colors.diffCodeCanvas)
        .task { await model.load() }
        .alert(
            "Review notes",
            isPresented: Binding(
                get: { model.errorMessage != nil || model.feedbackMessage != nil },
                set: { if !$0 { model.dismissMessage() } }
            )
        ) {
            Button("OK", action: model.dismissMessage)
        } message: {
            Text(verbatim: model.errorMessage ?? model.feedbackMessage ?? "")
        }
        .sheet(isPresented: $model.isShowingSend) {
            WorkspaceDiffNotesSendSheet(model: model)
        }
    }

    private func comments(for line: WorkspaceDiffLine) -> [SourceReviewComment] {
        guard let lineNumber = line.newLineNumber else { return [] }
        return model.comments.filter {
            $0.filePath == filePath && $0.source != "markdown" && $0.lineNumber == lineNumber
        }
    }

    private func startComment(_ line: Int) {
        activeCommentLine = line
        commentDraft = ""
    }

    private func cancelComment() {
        activeCommentLine = nil
        commentDraft = ""
    }

    private func saveComment(_ line: Int) {
        Task {
            if await model.add(
                filePath: filePath,
                lineNumber: line,
                body: commentDraft,
                source: source
            ) {
                cancelComment()
            }
        }
    }
}

private struct WorkspaceDiffCommentsBar: View {
    @Bindable var model: WorkspaceDiffCommentsModel

    var body: some View {
        HStack(spacing: 8) {
            YiruIcon(.chat, size: 16)
                .foregroundStyle(Theme.Colors.mutedForeground)
            Text(commentLabel)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Colors.mutedForeground)
            Spacer(minLength: 8)
            Button("Copy", iconID: .copy) { model.copyNotes() }
                .buttonStyle(.glass)
                .appButtonContext(.inline)
                .disabled(model.comments.isEmpty || model.isBusy)
            Button("Send", iconID: .upload) { model.isShowingSend = true }
                .appProminentGlassButton()
                .appButtonContext(.inline)
                .disabled(model.unsentComments.isEmpty || model.isBusy)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .glassEffect(.regular, in: .rect(cornerRadius: 14))
        .padding(.horizontal, 8)
        .padding(.top, 8)
    }

    private var commentLabel: String {
        switch model.comments.count {
        case 0: "No review notes"
        case 1: "1 review note"
        default: "\(model.comments.count) review notes"
        }
    }
}

private struct WorkspaceDiffCommentLine: View {
    let renderedLine: YiruDiffRenderLine
    let filePath: String
    let comments: [SourceReviewComment]
    let activeCommentLine: Int?
    let commentDraft: Binding<String>
    let isBusy: Bool
    let startComment: (Int) -> Void
    let cancelComment: () -> Void
    let saveComment: (Int) -> Void
    let deleteComment: (SourceReviewComment) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 0) {
                YiruDiffCodeGutter(kind: line.kind, lineNumber: lineNumber, tintPrefix: true)
                YiruDiffSyntaxText(
                    text: line.text,
                    filePath: filePath,
                    inlineSegments: renderedLine.inlineSegments,
                    emphasisColor: yiruDiffEmphasisColor(line.kind)
                )
                .textSelection(.enabled)
                .frame(
                    maxWidth: .infinity, minHeight: YiruDiffCodeLayout.minimumLineHeight,
                    alignment: .topLeading
                )
                .font(.system(size: YiruDiffCodeLayout.codeFontSize, design: .monospaced))
                .padding(.horizontal, YiruDiffCodeLayout.codeHorizontalPadding)
                if let lineNumber = line.newLineNumber {
                    GlassIconButton(
                        iconName: .add,
                        accessibilityLabel: "Add note on line \(lineNumber)",
                        context: .inline,
                        isDisabled: isBusy
                    ) { startComment(lineNumber) }
                }
            }
            .background(yiruDiffBackground(line.kind))

            ForEach(comments) { comment in
                commentView(comment)
            }
            if let lineNumber = line.newLineNumber, activeCommentLine == lineNumber {
                composer(lineNumber)
            }
        }
        .padding(.horizontal, 8)
    }

    private func commentView(_ comment: SourceReviewComment) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                YiruIcon(.chat, size: 14)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                Text("Line \(comment.lineNumber)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                Spacer(minLength: 4)
                GlassIconButton(
                    iconName: .x,
                    accessibilityLabel: "Delete note on line \(comment.lineNumber)",
                    context: .inline,
                    isDestructive: true,
                    isDisabled: isBusy
                ) { deleteComment(comment) }
            }
            Text(verbatim: comment.body)
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Colors.content, in: .rect(cornerRadius: 12))
    }

    private func composer(_ lineNumber: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            TextEditor(text: commentDraft)
                .font(.system(size: 14, design: .monospaced))
                .scrollContentBackground(.hidden)
                .frame(minHeight: 80)
                .padding(8)
                .background(Theme.Colors.content, in: .rect(cornerRadius: 12))
            HStack {
                Spacer(minLength: 0)
                Button("Cancel") { cancelComment() }
                    .buttonStyle(.glass)
                    .appButtonContext(.inline)
                Button("Save note", iconID: .check) { saveComment(lineNumber) }
                    .appProminentGlassButton()
                    .appButtonContext(.inline)
                    .disabled(
                        commentDraft.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines)
                            .isEmpty
                            || isBusy
                    )
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassEffect(.regular, in: .rect(cornerRadius: 14))
    }

    private var line: WorkspaceDiffLine { renderedLine.line }

    private var lineNumber: String {
        (line.newLineNumber ?? line.oldLineNumber).map(String.init) ?? ""
    }
}

struct WorkspaceDiffNotesSendSheet: View {
    @Bindable var model: WorkspaceDiffCommentsModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if model.isLoadingTerminals {
                        HStack(spacing: 8) {
                            ProgressView()
                                .controlSize(.small)
                            Text("Loading agent sessions…")
                        }
                    } else {
                        ForEach(model.terminals ?? []) { terminal in
                            Button {
                                Task {
                                    if await model.sendNotes(to: terminal) { dismiss() }
                                }
                            } label: {
                                Label(terminal.title, iconID: .terminal)
                            }
                            .disabled(model.isBusy)
                        }
                        Button("New Agent Session", iconID: .add) {
                            Task {
                                if await model.sendNotes(to: nil) { dismiss() }
                            }
                        }
                        .disabled(model.isBusy)
                    }
                } header: {
                    Text("\(model.unsentComments.count) unsent notes")
                }
                Button("Copy Notes", iconID: .copy) {
                    model.copyNotes()
                    dismiss()
                }
                .disabled(model.comments.isEmpty || model.isBusy)
            }
            .navigationTitle("Send Review Notes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(accessibilityLabel: "Close send review notes") {
                    model.isShowingSend = false
                    dismiss()
                }
            }
            .task { await model.loadTerminals() }
        }
        // Why: matches the other NavigationStack list sheets — no drag handle,
        // sized to page.
        .appSheetPresentation(.page)
    }
}
