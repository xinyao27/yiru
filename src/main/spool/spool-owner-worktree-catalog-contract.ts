import type { ExecutionHostId } from '../../shared/execution-host'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'

export type SpoolUnavailableCatalogSource = {
  repoId: string
  executionHostId: ExecutionHostId
  actualHostScope: string | null
}

export type SpoolOwnerWorktreeCatalogInventory = {
  worktrees: readonly SpoolOwnerWorktree[]
  unavailableSources: readonly SpoolUnavailableCatalogSource[]
}

export type SpoolOwnerWorktreeCatalog = {
  getWorktree(worktreeId: string): Promise<SpoolOwnerWorktree | null>
  getWorktreeByInstance(instanceId: string): Promise<SpoolOwnerWorktree | null>
  listProjectWorktrees(projectId: string): Promise<readonly SpoolOwnerWorktree[]>
  inspectRegisteredWorktrees(): Promise<SpoolOwnerWorktreeCatalogInventory>
}
