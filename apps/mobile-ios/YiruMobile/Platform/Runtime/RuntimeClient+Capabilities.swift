import Foundation

extension RuntimeClient: TerminalHostCapabilityRepository {
    func terminalCapabilities(for hostID: String) async -> TerminalHostCapabilities {
        guard
            let status: MobileRuntimeStatusWire = try? await callRuntime(
                hostID: hostID,
                path: MobileTerminalWireContract.statusPath,
                input: RuntimeNullWire(),
                output: MobileRuntimeStatusWire.self
            )
        else {
            return TerminalHostCapabilities(
                browserScreencastSupported: false,
                agentHistorySupported: false,
                quickCommandsSupported: false
            )
        }
        let capabilities = Set(status.capabilities ?? [])
        return TerminalHostCapabilities(
            browserScreencastSupported: capabilities.contains("browser.screencast.v1"),
            agentHistorySupported: capabilities.contains(MobileAgentHistoryWireContract.capability),
            quickCommandsSupported: capabilities.contains(
                MobileQuickCommandsWireContract.capability
            )
        )
    }
}

extension RuntimeClient: TerminalDisplayModeRuntime {
    func setTerminalDisplayMode(
        hostID: String,
        terminalID: String,
        mode: TerminalDisplayMode,
        viewport: TerminalGridSize?
    ) async throws -> TerminalDisplayMode {
        let wire: MobileTerminalSetDisplayModeResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.setDisplayModePath,
            input: MobileTerminalSetDisplayModeRequestWire(
                terminal: terminalID,
                mode: mode == .auto ? .auto : .desktop,
                client: MobileTerminalDisplayModeClientWire(
                    id: terminalClientInstanceID,
                    type: .mobile
                ),
                viewport: viewport.map {
                    MobileTerminalDisplayModeViewportWire(cols: $0.columns, rows: $0.rows)
                }
            ),
            output: MobileTerminalSetDisplayModeResultWire.self
        )
        switch wire.mode {
        case .auto: return .auto
        case .desktop: return .desktop
        }
    }
}

extension RuntimeClient {
    func focusTerminal(hostID: String, terminalID: String) async throws {
        let result: MobileTerminalFocusResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.focusPath,
            input: MobileTerminalHandleRequestWire(terminal: terminalID),
            output: MobileTerminalFocusResultWire.self
        )
        guard result.focus.handle == terminalID else {
            throw TerminalWorkspaceRepositoryError.rejectedMutation
        }
    }

    func inferAgentInterrupt(
        hostID: String,
        baseline: TerminalAgentInterruptBaseline
    ) async -> Bool {
        do {
            return try await callRuntime(
                hostID: hostID,
                path: MobileAgentStatusWireContract.inferInterruptPath,
                input: MobileAgentStatusInferInterruptRequestWire(
                    paneKey: baseline.paneKey,
                    baselineUpdatedAt: baseline.updatedAt,
                    baselineStateStartedAt: baseline.stateStartedAt,
                    baselinePrompt: baseline.prompt,
                    baselineAgentType: baseline.agentType,
                    intent: "plain-escape",
                    inputCount: nil
                ),
                output: Bool.self
            )
        } catch {
            return false
        }
    }

    func renameTerminal(hostID: String, terminalID: String, title: String) async throws -> String {
        let result: MobileTerminalRenameResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.renamePath,
            input: MobileTerminalRenameRequestWire(terminal: terminalID, title: title),
            output: MobileTerminalRenameResultWire.self
        )
        guard result.rename.handle == terminalID else {
            throw TerminalWorkspaceRepositoryError.rejectedMutation
        }
        return result.rename.title ?? String(localized: "Terminal")
    }

    func clearTerminal(hostID: String, terminalID: String) async throws {
        let result: MobileTerminalClearBufferResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.clearBufferPath,
            input: MobileTerminalHandleRequestWire(terminal: terminalID),
            output: MobileTerminalClearBufferResultWire.self
        )
        guard result.clear.handle == terminalID, result.clear.cleared else {
            throw TerminalWorkspaceRepositoryError.rejectedMutation
        }
    }

    func closeTerminal(hostID: String, terminalID: String) async throws {
        let result: MobileTerminalCloseResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.closePath,
            input: MobileTerminalHandleRequestWire(terminal: terminalID),
            output: MobileTerminalCloseResultWire.self
        )
        guard result.close.handle == terminalID else {
            throw TerminalWorkspaceRepositoryError.rejectedMutation
        }
    }
}
