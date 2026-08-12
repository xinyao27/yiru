import Foundation
import Observation

nonisolated enum TerminalWorkspacePhase: Sendable {
    case loading
    case loaded
    case failed(LocalizedStringResource)
}

nonisolated enum TerminalWorkspaceOperation: Equatable, Sendable {
    case activating(String)
    case closing(String)
    case creating
}

@Observable
@MainActor
final class TerminalWorkspaceModel {
    private(set) var phase = TerminalWorkspacePhase.loading
    private(set) var tabs: [TerminalWorkspaceTab] = []
    private(set) var activeTabID: String?
    private(set) var operation: TerminalWorkspaceOperation?
    private(set) var mutationError: LocalizedStringResource?
    private(set) var visitedTerminalTabIDs: Set<String> = []

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let worktreeID: String
    @ObservationIgnored private let repository: any TerminalWorkspaceRepository
    @ObservationIgnored private var snapshotGate = TerminalWorkspaceSnapshotGate()
    @ObservationIgnored private var pendingActiveTabID: String?
    @ObservationIgnored private var closedTabTombstones: [String: Date] = [:]
    @ObservationIgnored private var hasReceivedInitialSnapshot = false

    init(
        hostID: String,
        worktreeID: String,
        repository: any TerminalWorkspaceRepository
    ) {
        self.hostID = hostID
        self.worktreeID = worktreeID
        self.repository = repository
    }

    var activeTab: TerminalWorkspaceTab? {
        tabs.first { $0.id == activeTabID }
    }

    var retainedTerminalTabs: [TerminalWorkspaceTab] {
        tabs.filter { tab in
            visitedTerminalTabIDs.contains(tab.id) && tab.terminalTarget != nil
        }
    }

    func observe() async {
        await loadInitialSnapshot()
        while !Task.isCancelled {
            do {
                let updates = try await repository.workspaceTabUpdates(
                    for: hostID,
                    worktreeID: worktreeID
                )
                for try await snapshot in updates {
                    let shouldCreateInitialTerminal = apply(snapshot)
                    if shouldCreateInitialTerminal {
                        await createTerminal()
                    }
                }
            } catch is CancellationError {
                return
            } catch {
                await refresh(shouldReplaceFailure: false)
            }
            do {
                try await Task.sleep(for: .seconds(2))
            } catch {
                return
            }
        }
    }

    func reconnectAndLoad() async {
        phase = .loading
        await repository.reconnectWorkspaceHost(hostID: hostID)
        await refresh(shouldReplaceFailure: true)
    }

    func select(_ tab: TerminalWorkspaceTab) async {
        guard tab.id != activeTabID, operation == nil else { return }
        activeTabID = tab.id
        pendingActiveTabID = tab.id
        retainTerminalIfNeeded(tab)
        operation = .activating(tab.id)
        mutationError = nil
        do {
            let snapshot = try await repository.activateWorkspaceTab(
                for: hostID,
                worktreeID: worktreeID,
                tabID: tab.id,
                leafID: tab.leafID
            )
            apply(snapshot)
        } catch is CancellationError {
            return
        } catch {
            pendingActiveTabID = nil
            mutationError = "Yiru could not activate this tab."
            await refresh(shouldReplaceFailure: false)
        }
        operation = nil
    }

    func createTerminal() async {
        guard operation == nil else { return }
        operation = .creating
        mutationError = nil
        do {
            let snapshot = try await repository.createWorkspaceTerminal(
                for: hostID,
                worktreeID: worktreeID,
                afterTabID: activeTabID
            )
            apply(snapshot)
        } catch is CancellationError {
            return
        } catch {
            mutationError = "Yiru could not create a terminal."
        }
        operation = nil
    }

    func close(_ tab: TerminalWorkspaceTab) async {
        guard operation == nil else { return }
        operation = .closing(tab.id)
        mutationError = nil
        closedTabTombstones[tab.id] = Date().addingTimeInterval(5)
        removeLocally(tab)
        do {
            let snapshot = try await repository.closeWorkspaceTab(
                for: hostID,
                worktreeID: worktreeID,
                tabID: tab.id,
                leafID: tab.leafID
            )
            apply(snapshot)
        } catch is CancellationError {
            return
        } catch {
            closedTabTombstones.removeValue(forKey: tab.id)
            mutationError = "Yiru could not close this tab."
            await refresh(shouldReplaceFailure: false)
        }
        operation = nil
    }

    func dismissMutationError() {
        mutationError = nil
    }

    private func loadInitialSnapshot() async {
        guard !hasReceivedInitialSnapshot else { return }
        await refresh(shouldReplaceFailure: true)
        guard hasReceivedInitialSnapshot, tabs.isEmpty, operation == nil else { return }
        await createTerminal()
    }

    private func refresh(shouldReplaceFailure: Bool) async {
        do {
            let snapshot = try await repository.workspaceTabs(
                for: hostID,
                worktreeID: worktreeID
            )
            guard !Task.isCancelled else { return }
            apply(snapshot)
        } catch is CancellationError {
            return
        } catch TerminalWorkspaceRepositoryError.timeout {
            if shouldReplaceFailure {
                phase = .failed("The host did not respond. Check its connection and try again.")
            }
        } catch {
            if shouldReplaceFailure {
                phase = .failed("Yiru could not load this workspace session.")
            }
        }
    }

    @discardableResult
    private func apply(_ snapshot: TerminalWorkspaceSnapshot) -> Bool {
        guard
            snapshotGate.accepts(
                epoch: snapshot.publicationEpoch,
                version: snapshot.snapshotVersion
            )
        else { return false }
        let isInitialSnapshot = !hasReceivedInitialSnapshot
        hasReceivedInitialSnapshot = true
        let incomingIDs = Set(snapshot.tabs.map(\.id))
        for id in Array(closedTabTombstones.keys) where !incomingIDs.contains(id) {
            closedTabTombstones.removeValue(forKey: id)
        }
        let now = Date()
        tabs = snapshot.tabs.filter { tab in
            guard let expiry = closedTabTombstones[tab.id] else { return true }
            if expiry <= now {
                closedTabTombstones.removeValue(forKey: tab.id)
                return true
            }
            return false
        }
        let snapshotActiveID = resolvedSnapshotActiveID(snapshot.activeTabID)
        if let pendingActiveTabID,
            tabs.contains(where: { $0.id == pendingActiveTabID })
        {
            activeTabID = pendingActiveTabID
            if snapshotActiveID == pendingActiveTabID,
                confirmsWorkspaceSelection(publicationEpoch: snapshot.publicationEpoch)
            {
                self.pendingActiveTabID = nil
            }
        } else {
            pendingActiveTabID = nil
            activeTabID = snapshotActiveID
        }
        if let activeTab {
            retainTerminalIfNeeded(activeTab)
        }
        visitedTerminalTabIDs.formIntersection(incomingIDs)
        phase = .loaded
        return isInitialSnapshot && tabs.isEmpty
    }

    private func resolvedSnapshotActiveID(_ snapshotActiveID: String?) -> String? {
        if let snapshotActiveID, tabs.contains(where: { $0.id == snapshotActiveID }) {
            return snapshotActiveID
        }
        return tabs.first(where: \.isActive)?.id ?? tabs.first?.id
    }

    private func retainTerminalIfNeeded(_ tab: TerminalWorkspaceTab) {
        guard tab.terminalTarget != nil else { return }
        visitedTerminalTabIDs.insert(tab.id)
    }

    private func removeLocally(_ tab: TerminalWorkspaceTab) {
        let closingIndex = tabs.firstIndex(where: { $0.id == tab.id })
        tabs.removeAll { $0.id == tab.id }
        visitedTerminalTabIDs.remove(tab.id)
        guard activeTabID == tab.id else { return }
        let fallbackIndex = min(closingIndex ?? 0, max(0, tabs.count - 1))
        activeTabID = tabs.isEmpty ? nil : tabs[fallbackIndex].id
        if let activeTab {
            retainTerminalIfNeeded(activeTab)
        }
    }
}
