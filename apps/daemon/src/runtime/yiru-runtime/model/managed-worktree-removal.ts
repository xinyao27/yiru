import type { GitPushTarget, Repo } from '@yiru/runtime-protocol/workbench/types'
import type { GitWorktreeInfo, WorktreeMeta } from '@yiru/runtime-protocol/workbench/worktree-types'

import type { RuntimeStore } from './runtime-store'
import type { RuntimeWorktreeRemovalTarget } from './worktree-storage'

export type ManagedWorktreeRemovalContext = {
  store: RuntimeStore
  repo: Repo
  removalTarget: RuntimeWorktreeRemovalTarget
  force: boolean
  runHooks: boolean
  localWorktreeGitOptions: { wslDistro?: string }
  hasLocalWorktreeGitOptions: boolean
  registeredWorktrees: GitWorktreeInfo[]
  removedMeta: WorktreeMeta | undefined
  removedPushTarget: GitPushTarget | undefined
}
