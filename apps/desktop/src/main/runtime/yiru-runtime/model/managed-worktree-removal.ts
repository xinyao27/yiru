import type { GitPushTarget, Repo } from '~shared/types'
import type { GitWorktreeInfo, WorktreeMeta } from '~shared/worktree-types'

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
