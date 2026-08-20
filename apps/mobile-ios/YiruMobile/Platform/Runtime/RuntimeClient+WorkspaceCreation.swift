import Foundation

extension RuntimeClient: WorkspaceCreationRepository {
    func workspaceCreationOptions(for hostID: String) async throws -> WorkspaceCreationOptions {
        async let detectedResult: [String]? = try? await callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.preflightDetectAgentsPath,
            input: RuntimeEmptyObjectInput(),
            output: [String].self
        )
        async let settingsResult: MobileWorkspaceRuntimeSettingsEnvelopeWire? =
            try? await callRuntime(
                hostID: hostID,
                path: MobileRuntimeWireContract.settingsGetPath,
                input: RuntimeVoidInput(),
                output: MobileWorkspaceRuntimeSettingsEnvelopeWire.self
            )
        async let uiResult: MobileWorkspaceUIResultWire? = try? await callRuntime(
            hostID: hostID,
            path: MobileWorkspaceCreationWireContract.uiGetPath,
            input: RuntimeVoidInput(),
            output: MobileWorkspaceUIResultWire.self
        )
        async let preflightResult: MobileWorkspacePreflightWire? = try? await callRuntime(
            hostID: hostID,
            path: MobileWorkspaceCreationWireContract.preflightPath,
            input: RuntimeEmptyObjectInput(),
            output: MobileWorkspacePreflightWire.self
        )
        let repos = await fetchWorkspaceRepos(for: hostID)
        let detected = await detectedResult ?? []
        let settings = await settingsResult?.settings
        let trustedHooks =
            await uiResult?.ui.trustedYiruHooks?.mapValues(
                WorkspaceTrustedHookRepo.init(wire:)
            ) ?? [:]
        let agents = workspaceCreationAgents(
            detectedIDs: detected,
            disabledIDs: settings?.disabledTuiAgents ?? [],
            overrides: settings?.agentCmdOverrides ?? [:]
        )
        return WorkspaceCreationOptions(
            repos: repos,
            agents: agents,
            preferredAgentID: preferredWorkspaceCreationAgentID(
                available: agents,
                preferredID: settings?.defaultTuiAgent
            ),
            trustedHooks: trustedHooks,
            isGitLabAvailable: (await preflightResult)?.glab?.installed == true
        )
    }

    func workspaceTerminalAgents(for hostID: String, repoID: String?) async throws
        -> [WorkspaceCreationAgent]
    {
        async let settingsResult: MobileWorkspaceRuntimeSettingsEnvelopeWire = callRuntime(
            hostID: hostID,
            path: MobileRuntimeWireContract.settingsGetPath,
            input: RuntimeVoidInput(),
            output: MobileWorkspaceRuntimeSettingsEnvelopeWire.self
        )
        let connectionID: String?
        if let repoID {
            let repos = await fetchWorkspaceRepos(for: hostID)
            guard let repo = repos.first(where: { $0.id == repoID }) else {
                throw WorkspaceRepositoryError.hostNotFound
            }
            connectionID = repo.connectionID?.trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            connectionID = nil
        }
        let detected: [String]
        if let connectionID, !connectionID.isEmpty {
            detected = try await callRuntime(
                hostID: hostID,
                path: MobileRuntimeWireContract.preflightDetectRemoteAgentsPath,
                input: MobileWorkspaceDetectRemoteAgentsRequestWire(connectionId: connectionID),
                output: [String].self
            )
        } else {
            detected = try await callRuntime(
                hostID: hostID,
                path: MobileRuntimeWireContract.preflightDetectAgentsPath,
                input: RuntimeEmptyObjectInput(),
                output: [String].self
            )
        }
        let settings = try await settingsResult.settings
        let available = workspaceCreationAgents(
            detectedIDs: detected,
            disabledIDs: settings.disabledTuiAgents,
            overrides: settings.agentCmdOverrides
        ).filter { $0.runtimeID != nil }
        guard
            let preferred = available.first(where: {
                $0.id
                    == preferredWorkspaceCreationAgentID(
                        available: available,
                        preferredID: settings.defaultTuiAgent
                    )
            })
        else { return available }
        return [preferred] + available.filter { $0.id != preferred.id }
    }

    func workspaceSetupDetails(for hostID: String, repoID: String) async throws
        -> WorkspaceSetupDetails
    {
        let wire: MobileRepoHooksResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileWorkspaceCreationWireContract.hooksPath,
            input: MobileRepoSelectorRequestWire(repo: "id:\(repoID)"),
            output: MobileRepoHooksResultWire.self
        )
        return WorkspaceSetupDetails(wire: wire)
    }
}
