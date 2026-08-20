import SwiftUI

struct WorkspaceNewTabChooser: View {
    @State private var optionsModel: WorkspaceNewTabOptionsModel
    let isFloatingWorkspace: Bool
    let createAgent: (String) -> Void
    let createTerminal: () -> Void
    let createMarkdown: () -> Void
    let createBrowser: (String) -> Void
    let browserSupported: Bool
    let browserUnavailable: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.displayScale) private var displayScale
    @State private var isEnteringBrowser = false
    @State private var browserURL = ""
    @State private var browserValidationMessage: LocalizedStringResource?

    init(
        hostID: String,
        repoID: String?,
        repository: any WorkspaceCreationRepository,
        isFloatingWorkspace: Bool,
        createAgent: @escaping (String) -> Void,
        createTerminal: @escaping () -> Void,
        createMarkdown: @escaping () -> Void,
        createBrowser: @escaping (String) -> Void,
        browserSupported: Bool,
        browserUnavailable: @escaping () -> Void
    ) {
        _optionsModel = State(
            initialValue: WorkspaceNewTabOptionsModel(
                hostID: hostID,
                repoID: repoID,
                repository: repository
            )
        )
        self.isFloatingWorkspace = isFloatingWorkspace
        self.createAgent = createAgent
        self.createTerminal = createTerminal
        self.createMarkdown = createMarkdown
        self.createBrowser = createBrowser
        self.browserSupported = browserSupported
        self.browserUnavailable = browserUnavailable
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            if isEnteringBrowser {
                browserForm
            } else {
                options
            }
        }
        .background(Theme.Colors.background)
        .appSheetPresentation(.page)
        .presentationBackground(Theme.Colors.background)
        .task { await optionsModel.load() }
    }

    private var header: some View {
        HStack(spacing: 16) {
            GlassHeaderButton(
                iconName: isEnteringBrowser ? .arrowLeft : .x,
                accessibilityLabel: isEnteringBrowser ? "Back" : "Close sheet"
            ) {
                if isEnteringBrowser {
                    isEnteringBrowser = false
                } else {
                    dismiss()
                }
            }

            Text(isEnteringBrowser ? "New Browser" : "New Tab")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 32)
    }

    private var options: some View {
        ScrollView {
            VStack(spacing: 0) {
                agentOptions
                newTabOption(
                    title: Text("Terminal"),
                    icon: .terminalWindow
                ) {
                    dismiss()
                    createTerminal()
                }
                if !isFloatingWorkspace {
                    newTabSeparator
                    newTabOption(title: Text("Browser"), icon: .globe) {
                        if browserSupported {
                            isEnteringBrowser = true
                        } else {
                            dismiss()
                            browserUnavailable()
                        }
                    }
                    newTabSeparator
                    newTabOption(
                        title: Text("Markdown Note"),
                        icon: .fileText
                    ) {
                        dismiss()
                        createMarkdown()
                    }
                }
            }
            .background(Theme.Colors.content, in: .rect(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Theme.Colors.selection, lineWidth: 1 / displayScale)
            }
            .clipShape(.rect(cornerRadius: 16))
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollIndicators(.hidden)
    }

    @ViewBuilder
    private var agentOptions: some View {
        switch optionsModel.phase {
        case .idle, .loading:
            unavailableAgentRow(title: Text("Detecting Agents"), isLoading: true)
            newTabSeparator
        case .ready(let agents):
            if agents.isEmpty {
                unavailableAgentRow(title: Text("No Enabled Agents"), isLoading: false)
                newTabSeparator
            } else {
                ForEach(agents) { agent in
                    newTabAgentOption(
                        title: Text(verbatim: agent.label),
                        agentID: agent.id
                    ) {
                        dismiss()
                        createAgent(agent.id)
                    }
                    newTabSeparator
                }
            }
        case .failed:
            unavailableAgentRow(title: Text("Agent Presets Unavailable"), isLoading: false)
            newTabSeparator
        }
    }

    private var browserForm: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Enter a URL, or leave blank for a new tab.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .padding(.bottom, 8)

            ZStack(alignment: .leading) {
                if browserURL.isEmpty {
                    Text("https://example.com")
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .allowsHitTesting(false)
                }
                TextField("", text: $browserURL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .onSubmit(completeBrowser)
                    .onChange(of: browserURL) { _, _ in
                        browserValidationMessage = nil
                    }
                    .accessibilityLabel("Browser URL")
                    .accessibilityHint("Enter a URL, or leave blank for a new tab.")
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .glassEffect(.regular.interactive(), in: .capsule)

            if let browserValidationMessage {
                Text(browserValidationMessage)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Colors.attention)
                    .padding(.top, 8)
            }

            HStack(spacing: 8) {
                Spacer()
                Button("Cancel") { isEnteringBrowser = false }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                Button("Open", action: completeBrowser)
                    .appProminentGlassButton()
                    .appButtonContext(.regular)
            }
            .padding(.top, 12)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
    }

    private func completeBrowser() {
        guard let url = workspaceBrowserURL(browserURL) else {
            // Why: keep the input sheet open so an invalid URL can be corrected in place,
            // rather than silently dropping an attempted Browser creation.
            browserValidationMessage = "Enter a valid URL."
            return
        }
        browserValidationMessage = nil
        dismiss()
        createBrowser(url)
    }

    private func unavailableAgentRow(title: Text, isLoading: Bool) -> some View {
        HStack(spacing: 8) {
            YiruIcon(.robot, size: 16)
                .foregroundStyle(Theme.Colors.mutedForeground)
            title
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.Colors.mutedForeground)
            Spacer()
            if isLoading {
                ProgressView()
                    .controlSize(.small)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .opacity(0.6)
    }

    private func newTabOption(title: Text, icon: YiruIconID, action: @escaping () -> Void)
        -> some View
    {
        Button(action: action) {
            HStack(spacing: 8) {
                YiruIcon(icon, size: 16)
                title
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.Colors.foreground)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var newTabSeparator: some View {
        Rectangle()
            .fill(Theme.Colors.selection)
            .frame(height: 1 / displayScale)
            .padding(.horizontal, 12)
    }

    private func newTabAgentOption(
        title: Text,
        agentID: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                AgentMark(agentID: agentID, size: 16)
                title
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.Colors.foreground)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
