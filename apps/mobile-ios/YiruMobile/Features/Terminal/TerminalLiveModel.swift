import Foundation
import Observation

nonisolated enum TerminalLivePhase: Sendable {
    case connecting
    case reconnecting(attempt: Int)
    case restoring
    case active
    case ended
    case failed(LocalizedStringResource)
}

nonisolated private enum TerminalSurfaceAction: Sendable {
    case input(Data)
    case queryReply(Data)
    case resize(TerminalGridSize)
}

@Observable
@MainActor
final class TerminalLiveModel {
    let surface: any TerminalSurface
    private(set) var phase: TerminalLivePhase = .connecting {
        didSet {
            surface.setInputEnabled(canAcceptUserInput)
        }
    }
    private(set) var title: String
    private(set) var currentDirectory: String?
    private(set) var gridSize: TerminalGridSize?
    private(set) var linkRequest: URL?
    private(set) var bellRevision = 0
    private(set) var connectionAttempt = 0
    private(set) var displayMode = TerminalDisplayMode.auto
    private(set) var isDisplayModeUpdating = false

    @ObservationIgnored
    private let hostID: String
    @ObservationIgnored
    private let terminalID: String
    @ObservationIgnored
    private let isWritable: Bool
    @ObservationIgnored
    private let runtime: any TerminalSessionRuntime
    @ObservationIgnored
    private let displayModeRuntime: any TerminalDisplayModeRuntime
    @ObservationIgnored
    private var session: (any TerminalSession)?
    @ObservationIgnored
    private var activeConnectionID: UUID?
    @ObservationIgnored
    private var pendingActions: [TerminalSurfaceAction] = []
    @ObservationIgnored
    private var actionDrain: Task<Void, Never>?
    @ObservationIgnored
    private var appState = TerminalSessionAppState.foreground

    init(
        host: HostProfile,
        terminal: TerminalTarget,
        runtime: any TerminalSessionRuntime,
        displayModeRuntime: any TerminalDisplayModeRuntime,
        surfaceFactory: any TerminalSurfaceFactory,
        surfaceConfiguration: TerminalSurfaceConfiguration
    ) {
        hostID = host.id
        terminalID = terminal.id
        isWritable = terminal.isWritable
        self.runtime = runtime
        self.displayModeRuntime = displayModeRuntime
        title = terminal.title
        let surface = surfaceFactory.makeSurface(configuration: surfaceConfiguration)
        self.surface = surface
        surface.events = TerminalSurfaceEvents(
            onInput: { [weak self] bytes in
                guard self?.canAcceptUserInput == true else { return }
                self?.enqueue(.input(bytes))
            },
            onQueryReply: { [weak self] bytes in
                self?.enqueue(.queryReply(bytes))
            },
            onResize: { [weak self] size in
                self?.gridSize = size
                self?.enqueue(.resize(size))
            },
            onTitleChange: { [weak self] title in
                guard !title.isEmpty else { return }
                self?.title = title
            },
            onDirectoryChange: { [weak self] directory in
                self?.currentDirectory = directory
            },
            onOpenLink: { [weak self] link in
                self?.requestOpenLink(link)
            },
            onClipboardWriteRequest: { _ in },
            onBell: { [weak self] in
                self?.bellRevision += 1
            }
        )
        surface.setInputEnabled(false)
    }

    var canAcceptUserInput: Bool {
        guard isWritable, case .active = phase else { return false }
        return true
    }

    func connect(attempt: Int) async {
        let connectionID = UUID()
        guard await beginConnection(connectionID: connectionID, attempt: attempt) else { return }
        var retryCount = 0
        while activeConnectionID == connectionID, !Task.isCancelled {
            phase = retryCount == 0 ? .connecting : .reconnecting(attempt: retryCount)
            do {
                let opened = try await openSession(connectionID: connectionID)
                let didEnd = try await consume(opened)
                if case .active = phase {
                    retryCount = 0
                }
                await closeCurrentSession(connectionID: connectionID)
                if didEnd {
                    phase = .ended
                    break
                }
            } catch is CancellationError {
                break
            } catch {
                guard activeConnectionID == connectionID else { break }
                if case .active = phase {
                    retryCount = 0
                }
                await closeCurrentSession(connectionID: connectionID)
            }
            retryCount += 1
            phase = .reconnecting(attempt: retryCount)
            do {
                try await Task.sleep(for: TerminalReconnectPolicy.delay(attempt: retryCount))
            } catch {
                break
            }
        }
        await stopSession(connectionID: connectionID)
    }

    func retry() {
        connectionAttempt += 1
    }

    func setAppState(_ state: TerminalSessionAppState) async {
        appState = state
        await session?.setAppState(state)
    }

    func clearLinkRequest() {
        linkRequest = nil
    }

    private func openSession(connectionID: UUID) async throws -> any TerminalSession {
        let opened = try await runtime.openTerminalSession(
            hostID: hostID,
            terminalID: terminalID
        )
        try Task.checkCancellation()
        guard activeConnectionID == connectionID else {
            await opened.close()
            throw CancellationError()
        }
        session = opened
        await opened.setAppState(appState)
        phase = .restoring
        if let gridSize {
            enqueue(.resize(gridSize))
        }
        return opened
    }

    private func consume(_ session: any TerminalSession) async throws -> Bool {
        let events = await session.events()
        for try await event in events {
            try Task.checkCancellation()
            switch event {
            case .subscribed:
                phase = .active
            case .displayMode(let mode):
                displayMode = mode
            case .snapshot(let snapshot):
                phase = .restoring
                title = snapshot.metadata.lastTitle ?? title
                currentDirectory = snapshot.metadata.currentDirectory
                displayMode = snapshot.metadata.displayMode
                surface.restore(snapshot)
                try await session.acknowledgeSnapshot(id: snapshot.id)
                phase = .active
            case .output(let output):
                surface.feed(output.bytes)
                try await session.acknowledgeOutput(
                    endSequence: output.endSequence,
                    receiverQueueBytes: 0
                )
            case .clearBuffer:
                surface.clear()
            case .ended:
                return true
            }
        }
        return false
    }

    private func enqueue(_ action: TerminalSurfaceAction) {
        guard session != nil else { return }
        pendingActions.append(action)
        guard actionDrain == nil else { return }
        let connectionID = activeConnectionID
        actionDrain = Task { [weak self] in
            await self?.drainActions(connectionID: connectionID)
        }
    }

    private func drainActions(connectionID: UUID?) async {
        while activeConnectionID == connectionID, !pendingActions.isEmpty, !Task.isCancelled {
            let action = pendingActions.removeFirst()
            guard let session else { continue }
            do {
                switch action {
                case .input(let bytes):
                    try await session.sendInput(bytes)
                case .queryReply(let bytes):
                    try await session.sendQueryReply(bytes)
                case .resize(let size):
                    try await session.resize(size)
                }
            } catch {
                guard activeConnectionID == connectionID, !Task.isCancelled else { break }
                self.session = nil
                pendingActions.removeAll(keepingCapacity: true)
                await session.close()
            }
        }
        actionDrain = nil
    }

    private func beginConnection(connectionID: UUID, attempt: Int) async -> Bool {
        actionDrain?.cancel()
        actionDrain = nil
        pendingActions.removeAll(keepingCapacity: true)
        let closingSession = session
        session = nil
        activeConnectionID = connectionID
        await closingSession?.close()
        return activeConnectionID == connectionID && attempt == connectionAttempt
    }

    private func stopSession(connectionID: UUID) async {
        guard activeConnectionID == connectionID else { return }
        actionDrain?.cancel()
        actionDrain = nil
        pendingActions.removeAll(keepingCapacity: true)
        let closingSession = session
        session = nil
        activeConnectionID = nil
        await closingSession?.close()
    }

    private func closeCurrentSession(connectionID: UUID) async {
        guard activeConnectionID == connectionID else { return }
        actionDrain?.cancel()
        actionDrain = nil
        pendingActions.removeAll(keepingCapacity: true)
        let closingSession = session
        session = nil
        await closingSession?.close()
    }

    private func requestOpenLink(_ rawLink: String) {
        guard let url = URL(string: rawLink), ["http", "https"].contains(url.scheme) else {
            return
        }
        linkRequest = url
    }

    func toggleDisplayMode() async {
        guard !isDisplayModeUpdating else { return }
        let previous = displayMode
        let requested = previous.toggleTarget
        isDisplayModeUpdating = true
        displayMode = requested
        do {
            displayMode = try await displayModeRuntime.setTerminalDisplayMode(
                hostID: hostID,
                terminalID: terminalID,
                mode: requested,
                viewport: requested == .auto ? gridSize : nil
            )
        } catch {
            displayMode = previous
        }
        isDisplayModeUpdating = false
    }
}
