import Foundation

extension RuntimeClient: TerminalAutoRestoreRepository {
    func terminalAutoRestoreFit(for hostID: String) async throws -> TimeInterval? {
        let result: MobileTerminalAutoRestoreFitResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.getAutoRestoreFitPath,
            input: MobileTerminalEmptyRequestWire(),
            output: MobileTerminalAutoRestoreFitResultWire.self
        )
        return result.ms
    }

    func setTerminalAutoRestoreFit(
        for hostID: String,
        milliseconds: TimeInterval?
    ) async throws -> TimeInterval? {
        let result: MobileTerminalAutoRestoreFitResultWire = try await callRuntime(
            hostID: hostID,
            path: MobileTerminalWireContract.setAutoRestoreFitPath,
            input: MobileTerminalSetAutoRestoreFitRequestWire(ms: milliseconds),
            output: MobileTerminalAutoRestoreFitResultWire.self
        )
        return result.ms
    }
}
