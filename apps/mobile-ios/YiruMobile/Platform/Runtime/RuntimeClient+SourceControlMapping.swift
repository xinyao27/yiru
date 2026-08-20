import Foundation

nonisolated func sourceWorktreeRequest(_ worktreeID: String) -> MobileGitWorktreeRequestWire {
    MobileGitWorktreeRequestWire(worktree: sourceWorktreeID(worktreeID))
}

nonisolated func sourceWorktreeID(_ worktreeID: String) -> String { "id:\(worktreeID)" }

nonisolated func sourceEntry(_ wire: MobileGitStatusEntryWire) -> SourceFileEntry {
    SourceFileEntry(
        path: wire.path,
        status: SourceFileStatus(rawValue: wire.status.rawValue) ?? .modified,
        area: SourceStagingArea(rawValue: wire.area.rawValue) ?? .unstaged,
        oldPath: wire.oldPath,
        conflictStatus: wire.conflictStatus.map {
            $0 == .unresolved ? .unresolved : .resolvedLocally
        },
        added: wire.added,
        removed: wire.removed
    )
}
