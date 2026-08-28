import Foundation

extension RuntimeClient {
    func createWorkspace(
        for hostID: String,
        draft: WorkspaceCreationDraft,
        existingPaths: [String]
    ) async throws -> WorkspaceSummary {
        let requestedName = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let baseName =
            requestedName.isEmpty
            ? suggestedWorkspaceName(existingPaths: existingPaths) : requestedName
        let agent = draft.agentID.flatMap(MobileWorkspaceCreateAgentWire.init(rawValue:))
        var lastMessage: String?
        let attemptLimit = draft.failsOnBranchConflict ? 1 : 25
        for attempt in 0..<attemptLimit {
            let candidate = attempt == 0 ? baseName : "\(baseName)-\(attempt + 1)"
            do {
                let revision = try await workspaceRevision(hostID: hostID, scope: draft.repoID)
                let result: MobileWorkspaceCreateResultWire = try await callRuntime(
                    hostID: hostID,
                    path: MobileRuntimeWireContract.worktreeCreatePath,
                    input: MobileWorkspaceCreateRequestWire(
                        repo: "id:\(draft.repoID)",
                        expectedRevision: revision,
                        name: candidate,
                        displayName: draft.displayName,
                        baseBranch: nonempty(draft.baseBranch),
                        compareBaseRef: draft.compareBaseRef,
                        branchNameOverride: draft.usesWorkspaceNameAsBranch
                            ? candidate : nonempty(draft.branchName),
                        comment: nonempty(draft.note),
                        setupDecision: draft.setupDecision.wire,
                        startupCommand: nonempty(draft.startupCommand ?? ""),
                        startupDraft: draft.startupDraft,
                        startupAgent: agent,
                        createdWithAgent: agent,
                        pushTarget: draft.pushTarget?.wire,
                        linkedPR: draft.linkedPullRequest,
                        linkedGitLabMR: draft.linkedMergeRequest,
                        activate: draft.linkedPullRequest != nil || draft.linkedMergeRequest != nil
                            ? true : nil
                    ),
                    output: MobileWorkspaceCreateResultWire.self
                )
                let snapshot: WorkspaceSnapshot
                do {
                    snapshot = try await fetchWorkspaces(for: hostID)
                } catch is CancellationError {
                    throw CancellationError()
                } catch {
                    throw WorkspaceCreationError.createdWorkspaceUnavailable
                }
                guard
                    let workspace = snapshot.workspaces.first(where: {
                        $0.id == result.worktree.id
                    })
                else {
                    throw WorkspaceCreationError.createdWorkspaceUnavailable
                }
                return workspace
            } catch is CancellationError {
                throw CancellationError()
            } catch let error as WorkspaceCreationError {
                throw error
            } catch {
                let message = (error as? RuntimeOrpcError)?.serverMessage
                lastMessage = message
                guard isRetryableWorkspaceCreateConflict(message), attempt + 1 < attemptLimit else {
                    throw WorkspaceCreationError.rejected(message)
                }
            }
        }
        throw WorkspaceCreationError.rejected(lastMessage)
    }

    private func nonempty(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func workspaceRevision(hostID: String, scope: String) async throws -> Int {
        let result: MobileWorkspaceRevisionResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.workspaceEventsListPath,
            input: MobileWorkspaceRevisionRequestWire(scope: scope, limit: 1),
            output: MobileWorkspaceRevisionResultWire.self
        )
        return result.revision
    }

    private func isRetryableWorkspaceCreateConflict(_ message: String?) -> Bool {
        guard let value = message?.lowercased() else { return false }
        return value.contains("already exists locally")
            || value.contains("already exists on a remote")
            || (value.hasPrefix("branch \"") && value.contains("already exists"))
            || value.contains("already has pr #")
    }
}
