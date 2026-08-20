import Foundation

extension RuntimeClient {
    func workspaceSourceRefs(for hostID: String, repoID: String, query: String) async throws
        -> [WorkspaceSourceRef]
    {
        let wire: MobileRepoSearchRefsResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileWorkspaceCreationWireContract.searchRefsPath,
            input: MobileRepoSearchRefsRequestWire(
                repo: "id:\(repoID)",
                query: query.trimmingCharacters(in: .whitespacesAndNewlines),
                limit: 20
            ),
            output: MobileRepoSearchRefsResultWire.self
        )
        if let details = wire.refDetails {
            return details.map {
                WorkspaceSourceRef(refName: $0.refName, localBranchName: $0.localBranchName)
            }
        }
        return wire.refs.map { WorkspaceSourceRef(refName: $0, localBranchName: $0) }
    }

    func workspaceHostedSources(
        for hostID: String,
        repoID: String,
        provider: WorkspaceHostedSourceProvider,
        query: String,
        gitLabState: WorkspaceGitLabMRState
    ) async throws -> [WorkspaceHostedSource] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        switch provider {
        case .github:
            do {
                let wire: MobileGitHubWorkItemsResultWire = try await callRuntime(
                    hostID: hostID,
                    path: MobileWorkspaceCreationWireContract.githubWorkItemsPath,
                    input: MobileGitHubWorkItemsRequestWire(
                        repo: "id:\(repoID)",
                        limit: 50,
                        query: trimmed.isEmpty ? "is:pr" : "is:pr \(trimmed)"
                    ),
                    output: MobileGitHubWorkItemsResultWire.self
                )
                return wire.items.map { WorkspaceHostedSource(wire: $0, provider: .github) }
            } catch let error as RuntimeOrpcError
                where error.serverMessage?.contains(
                    "GitHub work items require a GitHub remote for SSH repositories"
                ) == true
            {
                throw WorkspaceHostedSourceError.githubRemoteRequired
            }
        case .gitlab:
            let wire: MobileGitLabMergeRequestsResultWire = try await callRuntime(
                hostID: hostID,
                path: MobileWorkspaceCreationWireContract.gitLabMergeRequestsPath,
                input: MobileGitLabMergeRequestsRequestWire(
                    repo: "id:\(repoID)",
                    state: MobileGitLabMRStateWire(rawValue: gitLabState.rawValue) ?? .opened,
                    page: 1,
                    perPage: 50,
                    query: trimmed.isEmpty ? nil : trimmed
                ),
                output: MobileGitLabMergeRequestsResultWire.self
            )
            if let error = wire.error, error.type != "not_found" {
                throw WorkspaceHostedSourceError.rejected(error.message)
            }
            return wire.items.map { WorkspaceHostedSource(wire: $0, provider: .gitlab) }
        }
    }

    func resolveWorkspaceHostedSource(
        for hostID: String,
        repoID: String,
        source: WorkspaceHostedSource
    ) async throws -> WorkspaceHostedBase {
        let result: MobileWorkspaceHostedBaseResultWire
        switch source.provider {
        case .github:
            result = try await callRuntime(
                hostID: hostID,
                path: MobileWorkspaceCreationWireContract.resolvePrBasePath,
                input: MobileWorkspaceResolvePrBaseRequestWire(
                    repo: "id:\(repoID)",
                    prNumber: source.number,
                    headRefName: source.branchName,
                    baseRefName: source.baseRefName,
                    isCrossRepository: source.isCrossRepository
                ),
                output: MobileWorkspaceHostedBaseResultWire.self
            )
        case .gitlab:
            result = try await callRuntime(
                hostID: hostID,
                path: MobileWorkspaceCreationWireContract.resolveMrBasePath,
                input: MobileWorkspaceResolveMrBaseRequestWire(
                    repo: "id:\(repoID)",
                    mrIid: source.number,
                    sourceBranch: source.branchName,
                    targetBranch: source.baseRefName,
                    isCrossRepository: source.isCrossRepository
                ),
                output: MobileWorkspaceHostedBaseResultWire.self
            )
        }
        if let error = result.error { throw WorkspaceHostedSourceError.rejected(error) }
        guard let baseBranch = result.baseBranch else {
            throw WorkspaceHostedSourceError.rejected(
                String(localized: "Failed to resolve base branch.")
            )
        }
        return WorkspaceHostedBase(
            baseBranch: baseBranch,
            compareBaseRef: result.compareBaseRef,
            pushTarget: result.pushTarget.map(WorkspacePushTarget.init(wire:)),
            branchNameOverride: result.branchNameOverride
        )
    }

    func workspacePastedGitHubSource(
        for hostID: String,
        repoID: String,
        number: Int,
        slug: WorkspaceRepoSlug?
    ) async throws -> WorkspaceHostedSource? {
        let wire: MobileWorkspaceSourceItemWire?
        if let slug {
            wire = try await callRuntime(
                hostID: hostID,
                path: MobileWorkspaceCreationWireContract.githubWorkItemByOwnerRepoPath,
                input: MobileGitHubWorkItemByOwnerRepoRequestWire(
                    repo: "id:\(repoID)",
                    owner: slug.owner,
                    ownerRepo: slug.repo,
                    number: number,
                    type: .pr
                ),
                output: MobileWorkspaceSourceItemWire?.self
            )
        } else {
            wire = try await callRuntime(
                hostID: hostID,
                path: MobileWorkspaceCreationWireContract.githubWorkItemPath,
                input: MobileGitHubWorkItemRequestWire(
                    repo: "id:\(repoID)", number: number, type: .pr),
                output: MobileWorkspaceSourceItemWire?.self
            )
        }
        return wire.map { WorkspaceHostedSource(wire: $0, provider: .github) }
    }

    func workspacePastedGitLabSource(
        for hostID: String,
        repoID: String,
        host: String,
        path: String,
        number: Int
    ) async throws -> WorkspaceHostedSource? {
        let wire: MobileWorkspaceSourceItemWire? = try await callRuntime(
            hostID: hostID,
            path: MobileWorkspaceCreationWireContract.gitLabWorkItemByPathPath,
            input: MobileGitLabWorkItemByPathRequestWire(
                repo: "id:\(repoID)", host: host, path: path, iid: number, type: .mr),
            output: MobileWorkspaceSourceItemWire?.self
        )
        return wire.map { WorkspaceHostedSource(wire: $0, provider: .gitlab) }
    }

    func workspaceRepoSlug(for hostID: String, repoID: String) async throws -> WorkspaceRepoSlug? {
        let wire: MobileGitHubRepoSlugResultWire? = try await callRuntime(
            hostID: hostID,
            path: MobileWorkspaceCreationWireContract.githubRepoSlugPath,
            input: MobileGitHubRepoSlugRequestWire(repo: "id:\(repoID)"),
            output: MobileGitHubRepoSlugResultWire?.self
        )
        return wire.map { WorkspaceRepoSlug(owner: $0.owner, repo: $0.repo) }
    }

    func persistWorkspaceSetupTrust(
        for hostID: String,
        trustedHooks: WorkspaceTrustedHooks
    ) async throws -> WorkspaceTrustedHooks {
        let wire: MobileWorkspaceUIResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileWorkspaceCreationWireContract.uiSetPath,
            input: MobileWorkspaceUISetRequestWire(
                trustedYiruHooks: trustedHooks.mapValues(\.wire)
            ),
            output: MobileWorkspaceUIResultWire.self
        )
        return wire.ui.trustedYiruHooks?.mapValues(WorkspaceTrustedHookRepo.init(wire:)) ?? [:]
    }
}
