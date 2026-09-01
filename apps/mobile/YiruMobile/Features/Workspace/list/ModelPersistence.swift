extension WorkspaceListModel {
    func applyLegacyPinnedState(to snapshot: WorkspaceSnapshot) -> WorkspaceSnapshot {
        var workspaces = snapshot.workspaces
        var confirmed: Set<String> = []
        for index in workspaces.indices {
            let workspace = workspaces[index]
            guard legacyPinnedIDs.contains(workspace.id) else { continue }
            if workspace.isPinned {
                confirmed.insert(workspace.id)
            } else {
                workspaces[index].applyLegacyPinnedState()
            }
        }
        if !confirmed.isEmpty {
            legacyPinnedIDs.subtract(confirmed)
            legacyPinnedStore.save(legacyPinnedIDs, hostID: hostID)
        }
        return WorkspaceSnapshot(
            workspaces: workspaces,
            repos: snapshot.repos,
            totalCount: snapshot.totalCount,
            isTruncated: snapshot.isTruncated
        )
    }

    func syncLegacyPinnedState(snapshot: WorkspaceSnapshot) async {
        let ids = Set(
            snapshot.workspaces.compactMap { workspace in
                legacyPinnedIDs.contains(workspace.id) ? workspace.id : nil
            })
        await syncLegacyPinnedState(ids: ids)
    }

    private func syncLegacyPinnedState(ids: Set<String>) async {
        for workspaceID in ids {
            guard syncingLegacyPinnedIDs.insert(workspaceID).inserted else { continue }
            defer { syncingLegacyPinnedIDs.remove(workspaceID) }
            do {
                try await repository.setWorkspacePinned(
                    hostID: hostID,
                    workspaceID: workspaceID,
                    isPinned: true
                )
                legacyPinnedIDs.remove(workspaceID)
                legacyPinnedStore.save(legacyPinnedIDs, hostID: hostID)
            } catch {
                // Keep the local overlay until a later connected poll can retry.
            }
        }
    }
}
