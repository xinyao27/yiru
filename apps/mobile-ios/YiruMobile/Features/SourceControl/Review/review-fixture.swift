#if DEBUG
    import Foundation
    import SwiftUI

    struct SourceReviewFixtureView: View {
        private let repository = SourceControlFixtureRepository()

        var body: some View {
            NavigationStack {
                SourceReviewView(
                    host: HostProfile(
                        id: "fixture-host",
                        name: "Mac Studio",
                        endpoint: "wss://fixture.invalid",
                        publicKeyBase64: "fixture",
                        lastConnected: Date()
                    ),
                    workspace: WorkspaceSummary(
                        sourceFixtureID: "liquid-glass",
                        repoID: "yiru",
                        repoName: "Yiru",
                        branch: "feat/liquid-glass",
                        name: "liquid-glass",
                        comment: "Native SwiftUI rewrite",
                        isPinned: false,
                        lastActivity: Date(),
                        activity: .active
                    ),
                    sourceRepository: repository,
                    reviewRepository: repository,
                    hostedReviewRepository: repository,
                    isGitHubRepositoryProbe: { true },
                    connectionRuntime: repository,
                    showWorkspaceSession: {}
                )
            }
        }
    }

    extension SourceControlFixtureRepository: SourceReviewRepository {
        func sourceReviewMetadata(for _: String, worktreeID _: String) async throws
            -> SourceReviewMetadata
        {
            SourceReviewMetadata(comments: [], state: .empty)
        }

        func saveSourceReviewMetadata(
            for _: String,
            worktreeID _: String,
            comments _: [SourceReviewComment],
            state _: SourceReviewState
        ) async throws {}

        func sourceReviewDiff(
            for _: String,
            worktreeID _: String,
            item: SourceReviewItem,
            branchComparison _: SourceBranchComparison?
        ) async throws -> SourceReviewDiff {
            if item.status == .deleted { return .deleted }
            return .document(
                .diff(
                    lines: [
                        WorkspaceDiffLine(
                            kind: .context,
                            text: "name: Mobile Android Release",
                            oldLineNumber: 1,
                            newLineNumber: 1
                        ),
                        WorkspaceDiffLine(
                            kind: .context,
                            text: "on:",
                            oldLineNumber: 2,
                            newLineNumber: 2
                        ),
                        WorkspaceDiffLine(
                            kind: .context,
                            text: "  push:",
                            oldLineNumber: 3,
                            newLineNumber: 3
                        ),
                        WorkspaceDiffLine(
                            kind: .delete,
                            text: "    branches: [main]",
                            oldLineNumber: 4,
                            newLineNumber: nil
                        ),
                        WorkspaceDiffLine(
                            kind: .add,
                            text: "    branches: [trunk]",
                            oldLineNumber: nil,
                            newLineNumber: 4
                        ),
                        WorkspaceDiffLine(
                            kind: .context,
                            text: "jobs:",
                            oldLineNumber: 5,
                            newLineNumber: 5
                        ),
                        WorkspaceDiffLine(
                            kind: .context,
                            text: "  build:",
                            oldLineNumber: 6,
                            newLineNumber: 6
                        ),
                        WorkspaceDiffLine(
                            kind: .delete,
                            text: "    runs-on: ubuntu-latest",
                            oldLineNumber: 7,
                            newLineNumber: nil
                        ),
                        WorkspaceDiffLine(
                            kind: .add,
                            text: "    runs-on: macos-latest",
                            oldLineNumber: nil,
                            newLineNumber: 7
                        ),
                    ],
                    isTruncated: false
                )
            )
        }

        func sourceReviewTerminals(for _: String, worktreeID _: String) async throws
            -> [SourceReviewTerminal]
        {
            [SourceReviewTerminal(id: "terminal:fixture", title: "Codex fixture")]
        }

        func createSourceReviewTerminal(for _: String, worktreeID _: String) async throws
            -> SourceReviewTerminal
        {
            SourceReviewTerminal(id: "terminal:new", title: "Review notes")
        }

        func sendSourceReviewNotes(
            for _: String,
            terminalID _: String,
            comments _: [SourceReviewComment]
        ) async throws {}

        func openSourceReviewInSession(
            for _: String,
            worktreeID _: String,
            item _: SourceReviewItem
        ) async throws {}
    }
#endif
