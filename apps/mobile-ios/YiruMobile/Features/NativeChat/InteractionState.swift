import Foundation
import Observation

@Observable
@MainActor
final class NativeChatInteractionModel {
    private(set) var filePaths: [String] = []
    private(set) var isAttaching = false
    private(set) var notice: String?

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let worktreeID: String
    @ObservationIgnored private let repository: any NativeChatRepository
    @ObservationIgnored private var queryCache: [String: [String]] = [:]
    @ObservationIgnored private var queryOrder: [String] = []
    @ObservationIgnored private var legacyPaths: [String]?
    @ObservationIgnored private var searchSupported: Bool?
    @ObservationIgnored private var searchTask: Task<Void, Never>?
    @ObservationIgnored private var searchSequence = 0
    @ObservationIgnored private var pastedImageTerminals: Set<String> = []
    @ObservationIgnored private var staleInputTerminals: Set<String> = []

    init(hostID: String, worktreeID: String, repository: any NativeChatRepository) {
        self.hostID = hostID
        self.worktreeID = worktreeID
        self.repository = repository
    }

    deinit { searchTask?.cancel() }

    func requestFiles(_ query: String) {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased().prefix(256)
        let key = String(normalized)
        if let cached = queryCache[key] {
            searchTask?.cancel()
            searchSequence += 1
            filePaths = cached
            return
        }
        searchTask?.cancel()
        searchSequence += 1
        let sequence = searchSequence
        filePaths = []
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(120))
            guard !Task.isCancelled, let self else { return }
            let paths = await self.loadFiles(query: key)
            guard !Task.isCancelled, self.searchSequence == sequence, let paths else { return }
            self.store(paths, for: key)
            self.filePaths = paths
        }
    }

    func openFile(_ path: String, terminalID: String?) {
        Task {
            do {
                try await repository.openNativeChatFile(
                    for: hostID,
                    worktreeID: worktreeID,
                    pathText: path,
                    terminalID: terminalID
                )
            } catch {
                showNotice("File could not be opened")
            }
        }
    }

    func attachImage(
        _ data: Data,
        terminalID: String,
        send: @escaping (String) async -> TerminalInputDeliveryOutcome
    ) {
        guard !isAttaching else { return }
        isAttaching = true
        notice = nil
        Task {
            defer { isAttaching = false }
            do {
                let path = try await repository.uploadNativeChatImage(for: hostID, data: data)
                guard await healStaleInput(terminalID: terminalID, send: send) else {
                    showNotice("Attach failed (reconnecting)")
                    return
                }
                let outcome = await send(nativeChatImagePastePayload(path))
                recordImagePasteOutcome(terminalID: terminalID, outcome: outcome)
                switch outcome {
                case .accepted:
                    showNotice("Attachment added")
                case .rejected:
                    showNotice("Attach failed")
                case .unknown:
                    showNotice("Attach delivery unconfirmed")
                }
            } catch let error as NativeChatRepositoryError {
                showNotice(error.localizedDescription)
            } catch {
                showNotice("Attach failed")
            }
        }
    }

    func beginChatSend(terminalID: String) -> Bool {
        pastedImageTerminals.contains(terminalID)
    }

    func recordChatSendOutcome(
        terminalID: String,
        includedPastedImage: Bool,
        outcome: TerminalInputDeliveryOutcome
    ) {
        guard includedPastedImage else { return }
        switch outcome {
        case .accepted:
            pastedImageTerminals.remove(terminalID)
            staleInputTerminals.remove(terminalID)
        case .rejected, .unknown:
            pastedImageTerminals.remove(terminalID)
            staleInputTerminals.insert(terminalID)
        }
    }

    func healStaleInput(
        terminalID: String,
        send: @escaping (String) async -> TerminalInputDeliveryOutcome
    ) async -> Bool {
        guard staleInputTerminals.contains(terminalID) else { return true }
        let outcome = await send("\u{0015}")
        guard case .accepted = outcome else { return false }
        staleInputTerminals.remove(terminalID)
        return true
    }

    func reportAttachmentFailure(_ message: String) {
        showNotice(message)
    }

    private func recordImagePasteOutcome(
        terminalID: String,
        outcome: TerminalInputDeliveryOutcome
    ) {
        switch outcome {
        case .accepted:
            staleInputTerminals.remove(terminalID)
            pastedImageTerminals.insert(terminalID)
        case .rejected, .unknown:
            pastedImageTerminals.remove(terminalID)
            staleInputTerminals.insert(terminalID)
        }
    }

    private func loadFiles(query: String) async -> [String]? {
        if searchSupported != false {
            do {
                let paths = try await repository.searchNativeChatFiles(
                    for: hostID,
                    worktreeID: worktreeID,
                    query: query,
                    limit: 16
                )
                searchSupported = true
                return paths
            } catch NativeChatRepositoryError.methodUnavailable {
                searchSupported = false
            } catch {
                return nil
            }
        }
        do {
            if legacyPaths == nil {
                legacyPaths = try await repository.listNativeChatFiles(
                    for: hostID,
                    worktreeID: worktreeID
                )
            }
            return rankNativeChatPaths(legacyPaths ?? [], query: query, limit: 16)
        } catch {
            return nil
        }
    }

    private func store(_ paths: [String], for query: String) {
        if queryCache[query] == nil { queryOrder.append(query) }
        queryCache[query] = paths
        while queryOrder.count > 20 {
            queryCache.removeValue(forKey: queryOrder.removeFirst())
        }
    }

    private func showNotice(_ value: String) {
        notice = value
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(1_500))
            guard self?.notice == value else { return }
            self?.notice = nil
        }
    }
}

nonisolated private func rankNativeChatPaths(
    _ candidates: [String],
    query: String,
    limit: Int
) -> [String] {
    guard !query.isEmpty else { return Array(candidates.prefix(limit)) }
    var prefixMatches: [String] = []
    var substringMatches: [String] = []
    for candidate in candidates {
        let lower = candidate.lowercased()
        let basename = lower.split(separator: "/").last.map(String.init) ?? lower
        if lower.hasPrefix(query) || basename.hasPrefix(query) {
            prefixMatches.append(candidate)
        } else if lower.contains(query) {
            substringMatches.append(candidate)
        }
        if prefixMatches.count >= limit { break }
    }
    return Array((prefixMatches + substringMatches).prefix(limit))
}

nonisolated private func nativeChatImagePastePayload(_ path: String) -> String {
    let safePath = path.replacingOccurrences(of: "\u{001B}", with: "\u{241B}")
    return "\u{001B}[200~\(safePath)\u{001B}[201~"
}
