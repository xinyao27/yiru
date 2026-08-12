import Foundation
import Observation

nonisolated enum TerminalLivePhase: Sendable {
    case connecting
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
    private(set) var phase: TerminalLivePhase = .connecting
    private(set) var title: String
    private(set) var currentDirectory: String?
    private(set) var gridSize: TerminalGridSize?
    private(set) var linkRequest: URL?
    private(set) var bellRevision = 0
    private(set) var connectionAttempt = 0

    @ObservationIgnored
    private let hostID: String
    @ObservationIgnored
    private let terminalID: String
    @ObservationIgnored
    private let isWritable: Bool
    @ObservationIgnored
    private let runtime: any TerminalSessionRuntime
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
        terminal: TerminalSummary,
        runtime: any TerminalSessionRuntime,
        surfaceFactory: any TerminalSurfaceFactory
    ) {
        hostID = host.id
        terminalID = terminal.id
        isWritable = terminal.isWritable
        self.runtime = runtime
        title = terminal.displayTitle
        let surface = surfaceFactory.makeSurface(configuration: .standard)
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
    }

    var canAcceptUserInput: Bool {
        guard isWritable, case .active = phase else { return false }
        return true
    }

    func connect(attempt: Int) async {
        let connectionID = UUID()
        guard await beginConnection(connectionID: connectionID, attempt: attempt) else { return }
        phase = .connecting
        do {
            let opened = try await runtime.openTerminalSession(
                hostID: hostID,
                terminalID: terminalID
            )
            try Task.checkCancellation()
            guard activeConnectionID == connectionID else {
                await opened.close()
                return
            }
            session = opened
            await opened.setAppState(appState)
            phase = .restoring
            if let gridSize {
                enqueue(.resize(gridSize))
            }
            let events = await opened.events()
            for try await event in events {
                try Task.checkCancellation()
                try await apply(event, to: opened)
            }
            if activeConnectionID == connectionID, !hasFailed {
                phase = .ended
            }
        } catch is CancellationError {
        } catch {
            if activeConnectionID == connectionID {
                phase = .failed("Yiru could not connect to this terminal.")
            }
        }
        await stopSession(connectionID: connectionID)
    }

    func retry() {
        connectionAttempt += 1
    }

    func focus() {
        guard canAcceptUserInput else { return }
        surface.focus()
    }

    func setAppState(_ state: TerminalSessionAppState) async {
        appState = state
        await session?.setAppState(state)
    }

    func clearLinkRequest() {
        linkRequest = nil
    }

    private var hasFailed: Bool {
        guard case .failed = phase else { return false }
        return true
    }

    private func apply(_ event: TerminalSessionEvent, to session: any TerminalSession) async throws
    {
        switch event {
        case .subscribed:
            phase = .active
        case .snapshot(let snapshot):
            phase = .restoring
            title = snapshot.metadata.lastTitle ?? title
            currentDirectory = snapshot.metadata.currentDirectory
            surface.restore(snapshot)
            try await session.acknowledgeSnapshot(id: snapshot.id)
        case .output(let output):
            surface.feed(output.bytes)
            try await session.acknowledgeOutput(
                endSequence: output.endSequence,
                receiverQueueBytes: 0
            )
        case .clearBuffer:
            surface.clear()
        case .ended:
            phase = .ended
        }
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
                phase = .failed("The terminal connection was interrupted.")
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

    private func requestOpenLink(_ rawLink: String) {
        guard let url = URL(string: rawLink), ["http", "https"].contains(url.scheme) else {
            return
        }
        linkRequest = url
    }
}
