import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import type { CoworkingOwnerWorktree } from './worktree-incarnation'

export type CoworkingUnavailableCatalogSource = {
  repoId: string
  executionHostId: ExecutionHostId
  actualHostScope: string | null
}

export type CoworkingOwnerWorktreeCatalogInventory = {
  worktrees: readonly CoworkingOwnerWorktree[]
  unavailableSources: readonly CoworkingUnavailableCatalogSource[]
}

export type CoworkingOwnerWorktreeCatalog = {
  getWorktree(worktreeId: string): Promise<CoworkingOwnerWorktree | null>
  getWorktreeByInstance(instanceId: string): Promise<CoworkingOwnerWorktree | null>
  listProjectWorktrees(projectId: string): Promise<readonly CoworkingOwnerWorktree[]>
  inspectRegisteredWorktrees(): Promise<CoworkingOwnerWorktreeCatalogInventory>
}
