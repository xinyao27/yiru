import { getRepoExecutionHostId, parseExecutionHostId } from '@yiru/workbench-model/workspace'
import { getRepoIdFromWorktreeId } from '@yiru/workbench-model/workspace'

import { mapWithConcurrency } from '../../../shared/map-with-concurrency'
import type { DetectedWorktreeListResult, ProjectHostSetup, Repo } from '../../../shared/types'
import type { Store } from '../../persistence'
import type { YiruRuntimeService } from '../../runtime/yiru-runtime'
import type { CoworkingPairedRuntimeWorktreeCatalog } from '../paired-runtime/worktree-catalog'
import {
  COWORKING_PUBLICATION_MAX_REGISTERED_REPOS,
  COWORKING_PUBLICATION_MAX_REGISTERED_WORKTREES,
  COWORKING_PUBLICATION_REPO_SCAN_CONCURRENCY
} from '../publication-inventory-limits'
import { resolveDirectCoworkingRepoActualHostScope } from '../repo-actual-host-scope'
import type { CoworkingOwnerWorktree } from '../worktree-incarnation'
import { CoworkingOwnerWorktreeCatalogError } from '../worktree-publication-validation'
import type {
  CoworkingOwnerWorktreeCatalog,
  CoworkingOwnerWorktreeCatalogInventory
} from './worktree-catalog-contract'
import {
  projectRegisteredCoworkingWorktree,
  coworkingRepoMayContainProject
} from './worktree-projection'

type CoworkingWorktreeRuntime = Pick<YiruRuntimeService, 'listDetectedManagedWorktrees'>

export type DefaultCoworkingOwnerWorktreeCatalogOptions = {
  store: Store
  runtime: CoworkingWorktreeRuntime
  listRuntimeWorktrees?: (
    environmentId: string,
    repo: Repo
  ) => Promise<CoworkingPairedRuntimeWorktreeCatalog>
}

/** Reads every registered workspace root from the host that actually owns it. */
export class DefaultCoworkingOwnerWorktreeCatalog implements CoworkingOwnerWorktreeCatalog {
  private readonly store: Store
  private readonly runtime: CoworkingWorktreeRuntime

  constructor(private readonly options: DefaultCoworkingOwnerWorktreeCatalogOptions) {
    this.store = options.store
    this.runtime = options.runtime
  }

  async getWorktree(worktreeId: string): Promise<CoworkingOwnerWorktree | null> {
    const repo = this.store.getRepo(getRepoIdFromWorktreeId(worktreeId))
    if (!repo) {
      return null
    }
    return (
      (await this.readAuthoritativeRepo(repo)).find((entry) => entry.worktreeId === worktreeId) ??
      null
    )
  }

  async getWorktreeByInstance(instanceId: string): Promise<CoworkingOwnerWorktree | null> {
    const metas = this.store.getAllWorktreeMeta()
    assertWorktreeInventoryCapacity(Object.keys(metas).length)
    const worktreeIds = Object.entries(metas).flatMap(([worktreeId, meta]) =>
      meta.instanceId === instanceId ? [worktreeId] : []
    )
    if (worktreeIds.length > 1) {
      throw new CoworkingOwnerWorktreeCatalogError('ambiguous')
    }
    const worktreeId = worktreeIds[0]
    return worktreeId ? await this.getWorktree(worktreeId) : null
  }

  async listProjectWorktrees(projectId: string): Promise<readonly CoworkingOwnerWorktree[]> {
    const setups = this.store.getProjectHostSetups()
    const metas = this.store.getAllWorktreeMeta()
    assertWorktreeInventoryCapacity(Object.keys(metas).length)
    const registeredRepos = this.store.getRepos()
    assertRepoInventoryCapacity(registeredRepos)
    const repos = registeredRepos.filter((repo) =>
      coworkingRepoMayContainProject(repo, projectId, setups, metas)
    )
    const targets = await this.readAuthoritativeRepos(repos)
    assertUniqueCatalogIdentities(targets)
    return targets.filter((entry) => entry.projectId === projectId)
  }

  async inspectRegisteredWorktrees(): Promise<CoworkingOwnerWorktreeCatalogInventory> {
    const setups = this.store.getProjectHostSetups()
    const repos = this.store.getRepos()
    const detectedByRepo = await this.inspectRepos(repos, setups)
    const targets = detectedByRepo.flatMap((entry) => entry.targets)
    assertUniqueCatalogIdentities(targets)
    return {
      worktrees: targets,
      unavailableSources: detectedByRepo.flatMap((entry) =>
        entry.authoritative
          ? []
          : [
              {
                repoId: entry.repo.id,
                executionHostId: getRepoExecutionHostId(entry.repo),
                actualHostScope: entry.actualHostScope
              }
            ]
      )
    }
  }

  private async readAuthoritativeRepo(repo: Repo): Promise<readonly CoworkingOwnerWorktree[]> {
    const inspected = await this.inspectRepo(repo, this.store.getProjectHostSetups())
    if (!inspected.authoritative) {
      throw new CoworkingOwnerWorktreeCatalogError('unavailable')
    }
    assertUniqueCatalogIdentities(inspected.targets)
    return inspected.targets
  }

  private async readAuthoritativeRepos(
    repos: readonly Repo[]
  ): Promise<readonly CoworkingOwnerWorktree[]> {
    const inspected = await this.inspectRepos(repos, this.store.getProjectHostSetups())
    const targets: CoworkingOwnerWorktree[] = []
    for (const entry of inspected) {
      if (!entry.authoritative) {
        throw new CoworkingOwnerWorktreeCatalogError('unavailable')
      }
      targets.push(...entry.targets)
    }
    return targets
  }

  private async inspectRepos(
    repos: readonly Repo[],
    setups: readonly ProjectHostSetup[]
  ): Promise<readonly CoworkingRepoInspection[]> {
    assertRepoInventoryCapacity(repos)
    const inspected: CoworkingRepoInspection[] = []
    let worktreeCount = 0
    for (
      let index = 0;
      index < repos.length;
      index += COWORKING_PUBLICATION_REPO_SCAN_CONCURRENCY
    ) {
      const batch = repos.slice(index, index + COWORKING_PUBLICATION_REPO_SCAN_CONCURRENCY)
      const entries = await mapWithConcurrency(
        batch,
        COWORKING_PUBLICATION_REPO_SCAN_CONCURRENCY,
        async (repo) => await this.inspectRepo(repo, setups)
      )
      worktreeCount += entries.reduce((count, entry) => count + entry.inventoryWorktreeCount, 0)
      if (worktreeCount > COWORKING_PUBLICATION_MAX_REGISTERED_WORKTREES) {
        throw new CoworkingOwnerWorktreeCatalogError('resource-limit')
      }
      inspected.push(...entries)
    }
    return inspected
  }

  private async inspectRepo(
    repo: Repo,
    setups: readonly ProjectHostSetup[]
  ): Promise<CoworkingRepoInspection> {
    let detected: DetectedWorktreeListResult
    let actualHostScope = resolveDirectCoworkingRepoActualHostScope(this.store, repo)
    try {
      const result = await this.listDetected(repo)
      detected = result.inventory
      actualHostScope = result.actualHostScope
    } catch {
      return {
        repo,
        authoritative: false,
        actualHostScope,
        targets: [],
        inventoryWorktreeCount: 0
      }
    }
    assertWorktreeInventoryCapacity(detected.worktrees.length)
    if (!detected.authoritative || detected.repoId !== repo.id) {
      return {
        repo,
        authoritative: false,
        actualHostScope,
        targets: [],
        inventoryWorktreeCount: detected.worktrees.length
      }
    }
    if (detected.worktrees.some((worktree) => worktree.repoId !== repo.id)) {
      return {
        repo,
        authoritative: false,
        actualHostScope,
        targets: [],
        inventoryWorktreeCount: detected.worktrees.length
      }
    }
    try {
      const targets = detected.worktrees.flatMap((worktree) => {
        const target = projectRegisteredCoworkingWorktree(
          repo,
          worktree,
          this.store.getWorktreeMeta(worktree.id),
          setups
        )
        return target ? [target] : []
      })
      return {
        repo,
        authoritative: true,
        actualHostScope,
        targets,
        inventoryWorktreeCount: detected.worktrees.length
      }
    } catch {
      // Why: malformed metadata on one host cannot collapse unrelated host inventories.
      return {
        repo,
        authoritative: false,
        actualHostScope,
        targets: [],
        inventoryWorktreeCount: detected.worktrees.length
      }
    }
  }

  private async listDetected(repo: Repo): Promise<{
    inventory: DetectedWorktreeListResult
    actualHostScope: string | null
  }> {
    const host = parseExecutionHostId(getRepoExecutionHostId(repo))
    if (host?.kind === 'runtime') {
      if (!this.options.listRuntimeWorktrees) {
        throw new Error('coworking_runtime_worktree_catalog_unavailable')
      }
      return await this.options.listRuntimeWorktrees(host.environmentId, repo)
    }
    return {
      inventory: await this.runtime.listDetectedManagedWorktrees(`id:${repo.id}`),
      actualHostScope: resolveDirectCoworkingRepoActualHostScope(this.store, repo)
    }
  }
}

type CoworkingRepoInspection = {
  repo: Repo
  authoritative: boolean
  actualHostScope: string | null
  targets: readonly CoworkingOwnerWorktree[]
  inventoryWorktreeCount: number
}

function assertRepoInventoryCapacity(repos: readonly Repo[]): void {
  if (repos.length > COWORKING_PUBLICATION_MAX_REGISTERED_REPOS) {
    throw new CoworkingOwnerWorktreeCatalogError('resource-limit')
  }
}

function assertWorktreeInventoryCapacity(count: number): void {
  if (count > COWORKING_PUBLICATION_MAX_REGISTERED_WORKTREES) {
    throw new CoworkingOwnerWorktreeCatalogError('resource-limit')
  }
}

function assertUniqueCatalogIdentities(targets: readonly CoworkingOwnerWorktree[]): void {
  const worktreeIds = new Set<string>()
  const instanceIds = new Set<string>()
  for (const target of targets) {
    if (worktreeIds.has(target.worktreeId) || instanceIds.has(target.instanceId)) {
      throw new CoworkingOwnerWorktreeCatalogError('ambiguous')
    }
    worktreeIds.add(target.worktreeId)
    instanceIds.add(target.instanceId)
  }
}
