#if DEBUG
    import SwiftUI

    private enum VisualParityFixture: String, CaseIterable, Identifiable {
        case home
        case homeOnboarding
        case activity
        case pairingScan
        case pairingConfirm
        case notificationOptIn
        case settings
        case workspaceList
        case workspaceCreation
        case workspaceActions
        case accounts
        case agentHistory
        case files
        case filePreview
        case sourceControl
        case commitHistory
        case sourceReview
        case hostedReview
        case terminalChrome
        case terminalActions
        case chat
        case chatWorking
        case chatPermission
        case chatEmpty
        case chatError
        case sessionContent
        case browser
        case hostEdit
        case designSystem

        var id: Self { self }

        var title: LocalizedStringResource {
            switch self {
            case .home: "Home dashboard"
            case .homeOnboarding: "Home onboarding"
            case .activity: "Activity insights"
            case .pairingScan: "Pairing scanner"
            case .pairingConfirm: "Pairing confirmation"
            case .notificationOptIn: "Notification opt-in"
            case .settings: "Settings screens"
            case .workspaceList: "Workspace list"
            case .workspaceCreation: "Create workspace"
            case .workspaceActions: "Workspace actions"
            case .accounts: "Accounts"
            case .agentHistory: "Agent history"
            case .files: "Files"
            case .filePreview: "File preview"
            case .sourceControl: "Source control"
            case .commitHistory: "Commit history"
            case .sourceReview: "Diff review"
            case .hostedReview: "Pull request"
            case .terminalChrome: "Session chrome"
            case .terminalActions: "Terminal actions"
            case .chat: "Chat transcript"
            case .chatWorking: "Agent working"
            case .chatPermission: "Permission request"
            case .chatEmpty: "Empty chat"
            case .chatError: "Chat error"
            case .sessionContent: "Markdown and diff tabs"
            case .browser: "Browser tab"
            case .hostEdit: "Edit host"
            case .designSystem: "Design system"
            }
        }

        var detail: LocalizedStringResource {
            switch self {
            case .home: "Workspace metrics, account usage, and the primary action."
            case .homeOnboarding: "First-run pairing guidance and primary action."
            case .activity: "Activity, token, value, provider, model, and project insights."
            case .pairingScan: "Camera access, scanner, paste-code fallback, and invalid codes."
            case .pairingConfirm: "Desktop identity, endpoint, pairing progress, and failure."
            case .notificationOptIn: "One-time notification permission decision."
            case .settings: "Appearance, chat, terminal, browser, notifications, and diagnostics."
            case .workspaceList: "Pinned, project, lineage, agent, file, and browser rows."
            case .workspaceCreation: "Repository, source, agent, setup, trust, and submit controls."
            case .workspaceActions: "Source control, history, sleep, pin, and delete actions."
            case .accounts: "Provider usage, managed accounts, loading, and stale states."
            case .agentHistory: "Scopes, search, skipped transcripts, and resume actions."
            case .files: "Folders, files, images, and unavailable entries."
            case .filePreview: "Production source renderer, navigation title, and line focus."
            case .sourceControl: "Changes, staging, branch comparison, commit, and history."
            case .commitHistory: "Commit metadata, pagination, refresh, and changed files."
            case .sourceReview: "Filters, file navigation, notes, staging, and review completion."
            case .hostedReview: "Pull request status, reviewers, checks, and mutations."
            case .terminalChrome: "Tabs, terminal surface, composer, and accessory bar."
            case .terminalActions: "Rename, quick commands, new tabs, and action sheets."
            case .chat: "Messages, Markdown, tool activity, copying, and the composer."
            case .chatWorking: "Streaming response, neutral loader, and stop action."
            case .chatPermission: "Blocked agent and the native permission controls."
            case .chatEmpty: "First-message state inside the real session chrome."
            case .chatError: "Transcript failure while the terminal remains connected."
            case .sessionContent: "Production markdown, file, and diff renderers."
            case .browser: "Remote viewport and native browser controls."
            case .hostEdit: "Host name, endpoint, save, and connection actions."
            case .designSystem: "Button contexts, loaders, colors, surfaces, and Glass rules."
            }
        }

        var section: VisualParitySection {
            switch self {
            case .home, .homeOnboarding, .activity, .pairingScan, .pairingConfirm,
                .notificationOptIn, .settings, .hostEdit, .designSystem:
                .system
            case .workspaceList, .workspaceCreation, .workspaceActions, .accounts, .agentHistory,
                .files, .filePreview, .sourceControl, .commitHistory, .sourceReview, .hostedReview:
                .workspace
            case .terminalChrome, .terminalActions, .chat, .chatWorking, .chatPermission,
                .chatEmpty, .chatError, .sessionContent, .browser:
                .session
            }
        }
    }

    private enum VisualParitySection: String, CaseIterable, Identifiable {
        case session
        case workspace
        case system

        var id: Self { self }

        var title: LocalizedStringResource {
            switch self {
            case .workspace: "Workspace surfaces"
            case .session: "Session surfaces"
            case .system: "System screens"
            }
        }

        var detail: LocalizedStringResource? {
            switch self {
            case .session:
                "Exercise the production session shell with deterministic terminal, chat, file, and browser states."
            case .workspace:
                "Inspect production data-heavy routes without pairing a desktop."
            case .system:
                nil
            }
        }
    }

    struct VisualParityCatalogView: View {
        @Environment(\.dismiss) private var dismiss
        let dependencies: AppDependencies
        @State private var selection: VisualParityFixture?

        var body: some View {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Theme.Spacing.large) {
                    ForEach(VisualParitySection.allCases) { section in
                        sectionView(section)
                    }
                }
                .padding(Theme.Spacing.page)
                .padding(.bottom, Theme.Spacing.extraLarge)
            }
            .background(Theme.Colors.background)
            .navigationTitle("UI Lab")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: dismiss.callAsFunction) {
                        YiruToolbarIcon(.x)
                    }
                    .accessibilityLabel("Close UI Lab")
                }
            }
            .sheet(item: $selection) { fixture in
                destination(fixture)
                    .appSheetPresentation(.page)
            }
        }

        private func sectionView(_ section: VisualParitySection) -> some View {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                    Text(section.title)
                        .font(.system(size: 14, weight: .semibold))
                    if let detail = section.detail {
                        Text(detail)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineSpacing(4)
                    }
                }
                SettingsSection {
                    let fixtures = VisualParityFixture.allCases.filter { $0.section == section }
                    ForEach(Array(fixtures.enumerated()), id: \.element.id) { index, fixture in
                        if index > 0 { SettingsDivider() }
                        Button {
                            selection = fixture
                        } label: {
                            HStack(spacing: Theme.Spacing.small) {
                                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                                    Text(fixture.title)
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundStyle(Theme.Colors.foreground)
                                    Text(fixture.detail)
                                        .font(.system(size: 12))
                                        .foregroundStyle(Theme.Colors.mutedForeground)
                                        .lineLimit(2)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                YiruIcon(
                                    .chevronRight,
                                    size: 16
                                )
                                .frame(width: 20)
                            }
                            .padding(.horizontal, Theme.Spacing.medium)
                            .padding(.vertical, Theme.Spacing.small)
                            .frame(minHeight: 64)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }

        @ViewBuilder
        private func destination(_ fixture: VisualParityFixture) -> some View {
            switch fixture {
            case .home:
                HomeFixtureView(scenario: .dashboard)
            case .homeOnboarding:
                HomeFixtureView(scenario: .onboarding)
            case .activity:
                ActivityInsightsFixtureView()
            case .pairingScan:
                PairingScanFixtureView()
            case .pairingConfirm:
                PairingConfirmFixtureView()
            case .notificationOptIn:
                NotificationOptInView(onFinished: {})
            case .settings:
                SettingsFixtureView(dependencies: dependencies)
            case .workspaceList:
                WorkspaceListFixtureView()
            case .workspaceCreation:
                WorkspaceCreationFixtureView()
            case .workspaceActions:
                WorkspaceActionsFixtureView()
            case .accounts:
                AccountFixtureView()
            case .agentHistory:
                AgentHistoryFixtureView()
            case .files:
                WorkspaceFileExplorerFixtureView()
            case .filePreview:
                WorkspaceFilePreviewFixtureView()
            case .sourceControl:
                SourceControlFixtureView()
            case .commitHistory:
                SourceControlFixtureView(showCommitHistory: true)
            case .sourceReview:
                SourceReviewFixtureView()
            case .hostedReview:
                SourceControlFixtureView(showHostedReview: true)
            case .terminalChrome:
                NavigationStack {
                    TerminalPrototypeView(factory: SwiftTermSurfaceFactory())
                }
            case .terminalActions:
                TerminalActionFixtureView()
            case .chat:
                NativeChatFixtureView(scenario: .chat)
            case .chatWorking:
                NativeChatFixtureView(scenario: .working)
            case .chatPermission:
                NativeChatFixtureView(scenario: .permission)
            case .chatEmpty:
                NativeChatFixtureView(scenario: .empty)
            case .chatError:
                NativeChatFixtureView(scenario: .error)
            case .sessionContent:
                SessionContentFixtureView()
            case .browser:
                WorkspaceBrowserFixtureView()
            case .hostEdit:
                NavigationStack {
                    HostEditView(
                        host: HostProfile(
                            id: "fixture-host",
                            name: "Mac Studio",
                            endpoint: "wss://mac-studio.local:6768",
                            publicKeyBase64: "fixture",
                            lastConnected: Date()
                        ),
                        repository: dependencies.hostRepository,
                        connectionRuntime: dependencies.hostConnectionRuntime,
                        onSaved: { _ in }
                    )
                }
            case .designSystem:
                NavigationStack {
                    DesignSystemCatalogView()
                }
            }
        }
    }
#endif
