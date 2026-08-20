#if DEBUG
    import Foundation
    import SwiftUI

    struct TerminalActionFixtureView: View {
        private let runtime: TerminalActionFixtureRuntime
        private let preferences = TerminalPreferences(store: UserDefaultsTerminalPreferenceStore())

        init(reconnects: Bool = false) {
            runtime = TerminalActionFixtureRuntime(shouldFailOpen: reconnects)
        }

        var body: some View {
            NavigationStack {
                TerminalLiveView(
                    host: HostProfile(
                        id: "fixture-host",
                        name: "Mac Studio",
                        endpoint: "wss://fixture.invalid",
                        publicKeyBase64: "fixture",
                        lastConnected: Date()
                    ),
                    terminal: TerminalTarget(
                        id: "terminal:fixture",
                        title: "Claude",
                        isWritable: true
                    ),
                    runtime: runtime,
                    displayModeRuntime: runtime,
                    surfaceFactory: SwiftTermSurfaceFactory(),
                    preferences: preferences
                )
            }
        }
    }

    nonisolated final class TerminalActionFixtureRuntime: TerminalSessionRuntime,
        TerminalDisplayModeRuntime, @unchecked Sendable
    {
        private let shouldFailOpen: Bool

        init(shouldFailOpen: Bool = false) {
            self.shouldFailOpen = shouldFailOpen
        }

        func openTerminalSession(
            hostID _: String,
            terminalID _: String,
            viewport _: TerminalGridSize?
        ) async throws
            -> any TerminalSession
        {
            if shouldFailOpen {
                throw TerminalActionFixtureError.unavailable
            }
            return TerminalActionFixtureSession()
        }

        func focusTerminal(hostID _: String, terminalID _: String) async throws {}

        func inferAgentInterrupt(
            hostID _: String,
            baseline _: TerminalAgentInterruptBaseline
        ) async -> Bool {
            true
        }

        func renameTerminal(hostID _: String, terminalID _: String, title: String) async throws
            -> String
        {
            title
        }

        func clearTerminal(hostID _: String, terminalID _: String) async throws {}
        func closeTerminal(hostID _: String, terminalID _: String) async throws {}

        func setTerminalDisplayMode(
            hostID _: String,
            terminalID _: String,
            mode: TerminalDisplayMode,
            viewport _: TerminalGridSize?
        ) async throws -> TerminalDisplayMode {
            mode
        }
    }

    nonisolated private enum TerminalActionFixtureError: Error {
        case unavailable
    }

    actor TerminalActionFixtureSession: TerminalSession {
        func events() async -> AsyncThrowingStream<TerminalSessionEvent, Error> {
            AsyncThrowingStream { continuation in
                continuation.yield(.subscribed)
            }
        }

        func sendInput(_: Data) async throws {}
        func sendInputConfirmed(_: Data) async throws {}
        func sendQueryReply(_: Data) async throws {}
        func resize(_: TerminalGridSize) async throws {}
        func acknowledgeOutput(endSequence _: UInt64, receiverQueueBytes _: UInt32) async throws {}
        func acknowledgeSnapshot(id _: UInt32) async throws {}
        func setAppState(_: TerminalSessionAppState) async {}
        func close() async {}
    }
#endif
