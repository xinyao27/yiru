import type { WorktreeMeta, WorktreeLineage, WorkspaceKey } from '~shared/types'
import { worktreeWorkspaceKey } from '~shared/workspace/scope'

import { StoreLayer6 } from './persistence-store-layer-6'
import type { CoworkingVisibilityCommitChange } from './persistence-store-types'

export abstract class StoreLayer7 extends StoreLayer6 {
  commitCoworkingVisibility(
    changes: readonly CoworkingVisibilityCommitChange[]
  ): readonly WorktreeMeta[] {
    if (changes.length === 0) {
      return []
    }
    if (this.durableStateFile.frozen) {
      throw new Error('coworking_visibility_store_frozen')
    }
    const previousMeta = this.state.worktreeMeta
    const previousWorktreeLineage = this.state.worktreeLineageById
    const previousWorkspaceLineage = this.state.workspaceLineageByChildKey
    const nextMeta = { ...previousMeta }
    const nextWorktreeLineage = { ...previousWorktreeLineage }
    const nextWorkspaceLineage = { ...previousWorkspaceLineage }
    const committed: WorktreeMeta[] = []
    const changedWorktreeIds = new Set<string>()
    const existingInstanceIds = new Set(
      Object.values(previousMeta).flatMap((meta) => (meta.instanceId ? [meta.instanceId] : []))
    )
    const nextInstanceIds = new Set<string>()

    for (const change of changes) {
      if (changedWorktreeIds.has(change.worktreeId)) {
        throw new Error('coworking_visibility_duplicate_change')
      }
      changedWorktreeIds.add(change.worktreeId)
      const existing = nextMeta[change.worktreeId]
      if (!existing || existing.instanceId !== change.expectedInstanceId) {
        throw new Error('coworking_visibility_stale_instance')
      }
      if (change.visibility === 'public' && !change.coworkingIncarnationId?.trim()) {
        throw new Error('coworking_visibility_missing_incarnation')
      }
      if (
        change.nextInstanceId !== undefined &&
        (!change.nextInstanceId.trim() ||
          existingInstanceIds.has(change.nextInstanceId) ||
          nextInstanceIds.has(change.nextInstanceId))
      ) {
        throw new Error('coworking_visibility_invalid_next_instance')
      }
      if (change.nextInstanceId) {
        nextInstanceIds.add(change.nextInstanceId)
        // Why: path reuse creates a new authorization identity; retaining
        // lineage would let the replacement inherit provenance from the old instance.
        for (const [worktreeId, lineage] of Object.entries(nextWorktreeLineage)) {
          if (
            lineage.worktreeInstanceId === change.expectedInstanceId ||
            lineage.parentWorktreeInstanceId === change.expectedInstanceId
          ) {
            delete nextWorktreeLineage[worktreeId]
          }
        }
        for (const [workspaceKey, lineage] of Object.entries(nextWorkspaceLineage)) {
          if (
            lineage.childInstanceId === change.expectedInstanceId ||
            lineage.parentInstanceId === change.expectedInstanceId
          ) {
            delete nextWorkspaceLineage[workspaceKey as WorkspaceKey]
          }
        }
      }
      const updated: WorktreeMeta = {
        ...existing,
        coworkingVisibility: change.visibility,
        ...(change.coworkingIncarnationId === undefined
          ? {}
          : { coworkingIncarnationId: change.coworkingIncarnationId }),
        ...(change.nextInstanceId === undefined ? {} : { instanceId: change.nextInstanceId })
      }
      nextMeta[change.worktreeId] = updated
      committed.push(updated)
    }

    this.state.worktreeMeta = nextMeta
    this.state.worktreeLineageById = nextWorktreeLineage
    this.state.workspaceLineageByChildKey = nextWorkspaceLineage
    try {
      // Why: Public/Private is an authorization boundary, so callers must not
      // observe success before the complete batch is durably replaced on disk.
      this.flushOrThrow()
      return committed
    } catch (error) {
      this.state.worktreeMeta = previousMeta
      this.state.worktreeLineageById = previousWorktreeLineage
      this.state.workspaceLineageByChildKey = previousWorkspaceLineage
      throw error
    }
  }

  removeWorktreeMeta(worktreeId: string): void {
    delete this.state.worktreeMeta[worktreeId]
    delete this.state.worktreeLineageById[worktreeId]
    delete this.state.workspaceLineageByChildKey[worktreeWorkspaceKey(worktreeId)]
    this.scheduleSave()
  }

  getWorktreeLineage(worktreeId: string): WorktreeLineage | undefined {
    return this.state.worktreeLineageById[worktreeId]
  }

  getAllWorktreeLineage(): Record<string, WorktreeLineage> {
    return this.state.worktreeLineageById
  }

  setWorktreeLineage(worktreeId: string, lineage: WorktreeLineage): WorktreeLineage {
    this.state.worktreeLineageById[worktreeId] = lineage
    this.scheduleSave()
    return lineage
  }

  removeWorktreeLineage(worktreeId: string): void {
    delete this.state.worktreeLineageById[worktreeId]
    this.scheduleSave()
  }
}
