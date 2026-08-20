import Foundation
import Observation

nonisolated enum NativeChatPhase: Sendable {
    case waiting
    case loading
    case ready
    case failed(String)
}

@Observable
@MainActor
final class NativeChatModel {
    nonisolated struct PendingMessage: Identifiable, Sendable {
        let id: String
        let text: String
        let expectedOccurrence: Int
    }

    nonisolated struct SendOrigin: Sendable {
        let id: String
        let scope: String?
        let text: String
        let expectedOccurrence: Int
    }

    private(set) var phase = NativeChatPhase.loading
    private(set) var messages: [NativeChatMessage] = []
    private(set) var foldedMessages: [NativeChatMessage] = []
    private(set) var hasMore = false
    private(set) var isLoadingEarlier = false
    private(set) var sendError: String?
    private(set) var pendingMessages: [PendingMessage] = []
    private(set) var isSending = false
    // Why: a prompt can be delivered before Desktop has published the provider session. Keep it
    // visible while the first hook snapshot catches up instead of making a successful PTY write
    // look like a dropped message.
    var queuedMessages: [PendingMessage] { pendingMessages + unconfirmedMessages }
    var draft: String {
        didSet { defaults.set(draft, forKey: draftKey) }
    }

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let repository: any NativeChatRepository
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let draftKey: String
    @ObservationIgnored private var agent: String?
    @ObservationIgnored private var sessionID: String?
    @ObservationIgnored private var transcriptPath: String?
    @ObservationIgnored private var beforeOffset: Int?
    @ObservationIgnored private var unconfirmedMessages: [PendingMessage] = []
    @ObservationIgnored private var unconfirmedTimers: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var activeSendID: String?
    @ObservationIgnored private var observationGeneration = 0

    private let initialMessageLimit = 40
    private let messagePageSize = 60
    private let maximumMessageCount = 2_000

    init(
        hostID: String,
        worktreeID: String,
        tabID: String,
        repository: any NativeChatRepository,
        defaults: UserDefaults = .standard
    ) {
        self.hostID = hostID
        self.repository = repository
        self.defaults = defaults
        draftKey = "yiru:nativeChatDraft:\(hostID):\(worktreeID):\(tabID)"
        draft = defaults.string(forKey: draftKey) ?? ""
    }

    func observe(agent: String?, sessionID: String?, transcriptPath: String?) async {
        observationGeneration += 1
        let generation = observationGeneration
        let previousScope = currentScope
        self.agent = agent
        self.sessionID = sessionID
        self.transcriptPath = transcriptPath
        if previousScope != currentScope {
            pendingMessages = []
            if previousScope != nil || currentScope == nil {
                cancelUnconfirmedTimers()
                unconfirmedMessages = []
                activeSendID = nil
                isSending = false
            }
        }
        messages = []
        foldedMessages = []
        beforeOffset = nil
        hasMore = false
        isLoadingEarlier = false
        sendError = nil
        guard let agent, let sessionID else {
            phase = .waiting
            return
        }
        while !Task.isCancelled {
            phase = messages.isEmpty ? .loading : .ready
            do {
                let updates = try await repository.nativeChatUpdates(
                    for: hostID,
                    agent: agent,
                    sessionID: sessionID,
                    transcriptPath: transcriptPath,
                    limit: initialMessageLimit
                )
                for try await frame in updates {
                    guard generation == observationGeneration, !Task.isCancelled else { return }
                    apply(frame)
                }
            } catch is CancellationError {
                return
            } catch {
                if generation == observationGeneration, messages.isEmpty {
                    phase = .failed(error.localizedDescription)
                }
            }
            do {
                try await Task.sleep(for: .seconds(2))
            } catch {
                return
            }
        }
    }

    func loadEarlier() async {
        guard
            hasMore,
            !isLoadingEarlier,
            let agent,
            let sessionID
        else { return }
        let generation = observationGeneration
        isLoadingEarlier = true
        defer {
            if generation == observationGeneration { isLoadingEarlier = false }
        }
        do {
            let requestedLimit: Int
            if beforeOffset == nil {
                requestedLimit = min(messages.count + messagePageSize, maximumMessageCount)
            } else {
                requestedLimit = messagePageSize
            }
            let page = try await repository.readNativeChat(
                for: hostID,
                agent: agent,
                sessionID: sessionID,
                transcriptPath: transcriptPath,
                beforeOffset: beforeOffset,
                limit: requestedLimit
            )
            guard generation == observationGeneration else { return }
            beforeOffset = page.beforeOffset
            hasMore = page.hasMore
            if page.beforeOffset == nil {
                // Why: older Desktop runtimes ignore the cursor and return a growing tail.
                // Replacing the list avoids duplicating that tail on every page request.
                setMessages(deduplicated(page.messages))
            } else {
                setMessages(merge(page.messages, with: messages))
            }
        } catch is CancellationError {
            return
        } catch {
            if generation == observationGeneration { sendError = error.localizedDescription }
        }
    }

    func markSendFailure(_ message: String?) {
        sendError = message
    }

    func beginSend(_ text: String) -> SendOrigin? {
        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty, !isSending else { return nil }
        let scope = currentScope
        let baseline = userOccurrenceCount(normalized)
        let outstanding = (pendingMessages + unconfirmedMessages).filter {
            $0.text == normalized && $0.expectedOccurrence > baseline
        }.count
        let id = UUID().uuidString
        activeSendID = id
        isSending = true
        return SendOrigin(
            id: id,
            scope: scope,
            text: normalized,
            expectedOccurrence: baseline + outstanding + 1
        )
    }

    func finishSend(_ origin: SendOrigin) {
        guard origin.id == activeSendID else { return }
        activeSendID = nil
        isSending = false
    }

    func acceptSend(_ origin: SendOrigin) {
        if draft.trimmingCharacters(in: .whitespacesAndNewlines) == origin.text {
            draft = ""
        }
        if origin.scope == nil {
            // Why: terminal input can be accepted before the provider hook publishes its
            // session identity. Retain the row until the authoritative transcript catches up.
            holdUnconfirmedSend(origin)
            return
        }
        guard origin.scope == currentScope else { return }
        pendingMessages.append(
            PendingMessage(
                id: "pending-\(UUID().uuidString)",
                text: origin.text,
                expectedOccurrence: origin.expectedOccurrence
            )
        )
    }

    func holdUnconfirmedSend(_ origin: SendOrigin) {
        guard origin.scope == nil || origin.scope == currentScope else { return }
        let pending = PendingMessage(
            id: "unconfirmed-\(UUID().uuidString)",
            text: origin.text,
            expectedOccurrence: origin.expectedOccurrence
        )
        if userOccurrenceCount(origin.text) >= origin.expectedOccurrence {
            if draft.trimmingCharacters(in: .whitespacesAndNewlines) == origin.text {
                draft = ""
            }
            return
        }
        unconfirmedMessages.append(pending)

        let generation = observationGeneration
        let scope = currentScope
        unconfirmedTimers[pending.id] = Task { @MainActor [weak self] in
            do {
                try await Task.sleep(for: .seconds(20))
            } catch {
                return
            }
            guard let self,
                self.observationGeneration == generation,
                self.currentScope == scope
            else { return }
            self.expireUnconfirmed(id: pending.id)
        }
    }

    private func apply(_ frame: NativeChatFrame) {
        switch frame {
        case .snapshot(let next, let more, let offset, let error):
            if let error {
                phase = .failed(error)
                return
            }
            setMessages(deduplicated(next))
            hasMore = more
            beforeOffset = offset
            phase = .ready
        case .replacement(let next, let more, let offset):
            setMessages(deduplicated(next))
            hasMore = more
            beforeOffset = offset
            phase = .ready
        case .appended(let appended):
            let merged = merge(messages, with: appended)
            let retained = Array(merged.suffix(maximumMessageCount))
            if retained.count < merged.count {
                // Why: once the live window drops its oldest row, the old byte cursor no
                // longer describes the retained transcript. The next history request must
                // ask for a growing tail instead of paging from a stale offset.
                beforeOffset = nil
                hasMore = true
            }
            setMessages(retained)
            phase = .ready
        case .end:
            break
        }
        reconcilePendingMessages()
    }

    private func merge(_ first: [NativeChatMessage], with second: [NativeChatMessage])
        -> [NativeChatMessage]
    {
        deduplicated(first + second)
    }

    private func setMessages(_ next: [NativeChatMessage]) {
        messages = next
        foldedMessages = foldTools(next)
    }

    private func deduplicated(_ input: [NativeChatMessage]) -> [NativeChatMessage] {
        var order: [String] = []
        var values: [String: NativeChatMessage] = [:]
        for message in input {
            let key = message.turnID ?? message.id
            if values[key] == nil { order.append(key) }
            if let current = values[key], current.source.priority > message.source.priority {
                continue
            }
            values[key] = message
        }
        return order.compactMap { values[$0] }
    }

    private func reconcilePendingMessages() {
        let counts = Dictionary(
            grouping: messages.compactMap { message -> String? in
                guard message.role == .user else { return nil }
                let text = message.plainText.trimmingCharacters(in: .whitespacesAndNewlines)
                return text.isEmpty ? nil : text
            }, by: { $0 }
        ).mapValues(\.count)
        pendingMessages.removeAll { pending in
            (counts[pending.text] ?? 0) >= pending.expectedOccurrence
        }
        let landed = unconfirmedMessages.filter { pending in
            (counts[pending.text] ?? 0) >= pending.expectedOccurrence
        }
        for pending in landed {
            unconfirmedTimers.removeValue(forKey: pending.id)?.cancel()
        }
        for pending in landed
        where draft.trimmingCharacters(in: .whitespacesAndNewlines) == pending.text {
            draft = ""
        }
        unconfirmedMessages.removeAll { pending in
            (counts[pending.text] ?? 0) >= pending.expectedOccurrence
        }
        if !landed.isEmpty, unconfirmedMessages.isEmpty,
            sendError == String(localized: "Delivery unconfirmed — check chat before retrying")
        {
            sendError = nil
        }
    }

    private func expireUnconfirmed(id: String) {
        unconfirmedTimers.removeValue(forKey: id)
        guard let index = unconfirmedMessages.firstIndex(where: { $0.id == id }) else { return }
        unconfirmedMessages.remove(at: index)
        sendError = String(localized: "Delivery unconfirmed — check chat before retrying")
    }

    private func cancelUnconfirmedTimers() {
        for timer in unconfirmedTimers.values {
            timer.cancel()
        }
        unconfirmedTimers.removeAll()
    }

    private func userOccurrenceCount(_ text: String) -> Int {
        messages.filter {
            $0.role == .user
                && $0.plainText.trimmingCharacters(in: .whitespacesAndNewlines) == text
        }.count
    }

    private var currentScope: String? {
        guard let agent, let sessionID else { return nil }
        return [agent, sessionID].joined(separator: "\u{0000}")
    }

    private func foldTools(_ input: [NativeChatMessage]) -> [NativeChatMessage] {
        var output: [NativeChatMessage] = []
        for message in input where !message.blocks.isEmpty {
            let isToolOnly = message.blocks.allSatisfy {
                switch $0 {
                case .toolCall, .toolResult: true
                case .text, .image: false
                }
            }
            if let previous = output.last,
                previous.role == .assistant,
                message.role == .assistant || isToolOnly
            {
                output[output.count - 1] = NativeChatMessage(
                    id: previous.id,
                    role: previous.role,
                    blocks: previous.blocks + message.blocks,
                    timestamp: previous.timestamp,
                    source: previous.source,
                    turnID: previous.turnID
                )
            } else {
                output.append(message)
            }
        }
        return output
    }
}
