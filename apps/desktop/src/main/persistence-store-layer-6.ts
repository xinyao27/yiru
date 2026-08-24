import { randomUUID } from 'node:crypto'

import type { WorktreeMeta } from '~shared/types'

import { StoreLayer5 } from './persistence-store-layer-5'
import { getDefaultWorktreeMeta } from './persistence-worktree-default'

export abstract class StoreLayer6 extends StoreLayer5 {
  getWorktreeMeta(worktreeId: string): WorktreeMeta | undefined {
    return this.state.worktreeMeta[worktreeId]
  }

  getAllWorktreeMeta(): Record<string, WorktreeMeta> {
    return this.state.worktreeMeta
  }

  setWorktreeMeta(worktreeId: string, meta: Partial<WorktreeMeta>): WorktreeMeta {
    const existing = this.state.worktreeMeta[worktreeId] || getDefaultWorktreeMeta()
    const updated = { ...existing, ...meta }
    if (!updated.instanceId) {
      updated.instanceId = randomUUID()
    }
    this.state.worktreeMeta[worktreeId] = updated
    this.scheduleSave()
    return updated
  }
}
