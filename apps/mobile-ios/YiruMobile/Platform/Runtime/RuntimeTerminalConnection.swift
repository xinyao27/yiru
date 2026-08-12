import Foundation

nonisolated struct RuntimeTerminalConnectionContext: Sendable {
    let credential: HostCredential
    let controlSession: RuntimeHostSession
    let clientInstanceID: String
}

extension RuntimeClient {
    func openTerminalSession(hostID: String, terminalID: String) async throws
        -> any TerminalSession
    {
        let context = try await terminalConnectionContext(for: hostID)
        async let status: MobileRuntimeStatusWire = context.controlSession.call(
            path: MobileTerminalWireContract.statusPath,
            input: RuntimeNullWire(),
            output: MobileRuntimeStatusWire.self
        )
        async let terminal: MobileTerminalShowWire = context.controlSession.call(
            path: MobileTerminalWireContract.showPath,
            input: MobileTerminalHandleRequestWire(terminal: terminalID),
            output: MobileTerminalShowWire.self
        )
        let (runtimeStatus, shownTerminal) = try await (status, terminal)
        let controlGeneration = await context.controlSession.generation()
        guard
            runtimeStatus.capabilities?.contains(MobileTerminalWireContract.multiplexCapability)
                == true
        else {
            throw RuntimeTerminalConnectionError.capabilityUnavailable
        }
        let ticket: MobileTerminalOpenMultiplexWire = try await context.controlSession.call(
            path: MobileTerminalWireContract.openMultiplexPath,
            input: MobileTerminalOpenMultiplexRequestWire(
                environmentId: runtimeStatus.runtimeId,
                clientInstanceId: context.clientInstanceID
            ),
            output: MobileTerminalOpenMultiplexWire.self
        )
        let bulk = try await TerminalBulkConnection.connect(
            ticket: ticket,
            credential: context.credential,
            isControlGenerationCurrent: {
                await context.controlSession.generation() == controlGeneration
            }
        )
        let session = await TerminalMultiplexSession(
            bulk: bulk,
            terminalID: terminalID,
            transportGeneration: shownTerminal.transportGeneration,
            clientID: context.clientInstanceID
        )
        await session.start()
        return session
    }
}

nonisolated private struct RuntimeNullWire: Encodable {
    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encodeNil()
    }
}

nonisolated private enum RuntimeTerminalConnectionError: Error {
    case capabilityUnavailable
}
