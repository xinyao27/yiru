import { getRepoExecutionHostId, parseExecutionHostId } from '../../shared/execution-host'
import { mapWithConcurrency } from '../../shared/map-with-concurrency'
import type { DetectedWorktreeListResult, ProjectHostSetup, Repo } from '../../shared/types'
import { getRepoIdFromWorktreeId } from '../../shared/worktree-id'
import type { Store } from '../persistence'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import type {
  SpoolOwnerWorktreeCatalog,
  SpoolOwnerWorktreeCatalogInventory
} from './spool-owner-worktree-catalog-contract'
import {
  projectRegisteredSpoolWorktree,
  spoolRepoMayContainProject
} from './spool-owner-worktree-projection'
import type { SpoolPairedRuntimeWorktreeCatalog } from './spool-paired-runtime-worktree-catalog'
import {
  SPOOL_PUBLICATION_MAX_REGISTERED_REPOS,
  SPOOL_PUBLICATION_MAX_REGISTERED_WORKTREES,
  SPOOL_PUBLICATION_REPO_SCAN_CONCURRENCY
} from './spool-publication-inventory-limits'
import { resolveDirectSpoolRepoActualHostScope } from './spool-repo-actual-host-scope'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'
import { SpoolOwnerWorktreeCatalogError } from './spool-worktree-publication-validation'

type SpoolWorktreeRuntime = Pick<YiruRuntimeService, 'listDetectedManagedWorktrees'>

export type DefaultSpoolOwnerWorktreeCatalogOptions = {
  store: Store
  runtime: SpoolWorktreeRuntime
  listRuntimeWorktrees?: (
    environmentId: string,
    repo: Repo
  ) => Promise<SpoolPairedRuntimeWorktreeCatalog>
}

/** Reads every registered workspace root from the host that actually owns it. */
export class DefaultSpoolOwnerWorktreeCatalog implements SpoolOwnerWorktreeCatalog {
  private readonly store: Store
  private readonly runtime: SpoolWorktreeRuntime

  constructor(private readonly options: DefaultSpoolOwnerWorktreeCatalogOptions) {
    this.store = options.store
    this.runtime = options.runtime
  }

  async getWorktree(worktreeId: string): Promise<SpoolOwnerWorktree | null> {
    const repo = this.store.getRepo(getRepoIdFromWorktreeId(worktreeId))
    if (!repo) {
      return null
    }
    return (
      (await this.readAuthoritativeRepo(repo)).find((entry) => entry.worktreeId === worktreeId) ??
      null
    )
  }

  async getWorktreeByInstance(instanceId: string): Promise<SpoolOwnerWorktree | null> {
    const metas = this.store.getAllWorktreeMeta()
    assertWorktreeInventoryCapacity(Object.keys(metas).length)
    const worktreeIds = Object.entries(metas).flatMap(([worktreeId, meta]) =>
      meta.instanceId === instanceId ? [worktreeId] : []
    )
    if (worktreeIds.length > 1) {
      throw new SpoolOwnerWorktreeCatalogError('ambiguous')
    }
    const worktreeId = worktreeIds[0]
    return worktreeId ? await this.getWorktree(worktreeId) : null
  }

  async listProjectWorktrees(projectId: string): Promise<readonly SpoolOwnerWorktree[]> {
    const setups = this.store.getProjectHostSetups()
    const metas = this.store.getAllWorktreeMeta()
    assertWorktreeInventoryCapacity(Object.keys(metas).length)
    const registeredRepos = this.store.getRepos()
    assertRepoInventoryCapacity(registeredRepos)
    const repos = registeredRepos.filter((repo) =>
      spoolRepoMayContainProject(repo, projectId, setups, metas)
    )
    const targets = await this.readAuthoritativeRepos(repos)
    assertUniqueCatalogIdentities(targets)
    return targets.filter((entry) => entry.projectId === projectId)
  }

  async inspectRegisteredWorktrees(): Promise<SpoolOwnerWorktreeCatalogInventory> {
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

  private async readAuthoritativeRepo(repo: Repo): Promise<readonly SpoolOwnerWorktree[]> {
    const inspected = await this.inspectRepo(repo, this.store.getProjectHostSetups())
    if (!inspected.authoritative) {
      throw new SpoolOwnerWorktreeCatalogError('unavailable')
    }
    assertUniqueCatalogIdentities(inspected.targets)
    return inspected.targets
  }

  private async readAuthoritativeRepos(
    repos: readonly Repo[]
  ): Promise<readonly SpoolOwnerWorktree[]> {
    const inspected = await this.inspectRepos(repos, this.store.getProjectHostSetups())
    const targets: SpoolOwnerWorktree[] = []
    for (const entry of inspected) {
      if (!entry.authoritative) {
        throw new SpoolOwnerWorktreeCatalogError('unavailable')
      }
      targets.push(...entry.targets)
    }
    return targets
  }

  private async inspectRepos(
    repos: readonly Repo[],
    setups: readonly ProjectHostSetup[]
  ): Promise<readonly SpoolRepoInspection[]> {
    assertRepoInventoryCapacity(repos)
    const inspected: SpoolRepoInspection[] = []
    let worktreeCount = 0
    for (let index = 0; index < repos.length; index += SPOOL_PUBLICATION_REPO_SCAN_CONCURRENCY) {
      const batch = repos.slice(index, index + SPOOL_PUBLICATION_REPO_SCAN_CONCURRENCY)
      const entries = await mapWithConcurrency(
        batch,
        SPOOL_PUBLICATION_REPO_SCAN_CONCURRENCY,
        async (repo) => await this.inspectRepo(repo, setups)
      )
      worktreeCount += entries.reduce((count, entry) => count + entry.inventoryWorktreeCount, 0)
      if (worktreeCount > SPOOL_PUBLICATION_MAX_REGISTERED_WORKTREES) {
        throw new SpoolOwnerWorktreeCatalogError('resource-limit')
      }
      inspected.push(...entries)
    }
    return inspected
  }

  private async inspectRepo(
    repo: Repo,
    setups: readonly ProjectHostSetup[]
  ): Promise<SpoolRepoInspection> {
    let detected: DetectedWorktreeListResult
    let actualHostScope = resolveDirectSpoolRepoActualHostScope(this.store, repo)
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
        const target = projectRegisteredSpoolWorktree(
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
        throw new Error('spool_runtime_worktree_catalog_unavailable')
      }
      return await this.options.listRuntimeWorktrees(host.environmentId, repo)
    }
    return {
      inventory: await this.runtime.listDetectedManagedWorktrees(`id:${repo.id}`),
      actualHostScope: resolveDirectSpoolRepoActualHostScope(this.store, repo)
    }
  }
}

type SpoolRepoInspection = {
  repo: Repo
  authoritative: boolean
  actualHostScope: string | null
  targets: readonly SpoolOwnerWorktree[]
  inventoryWorktreeCount: number
}

function assertRepoInventoryCapacity(repos: readonly Repo[]): void {
  if (repos.length > SPOOL_PUBLICATION_MAX_REGISTERED_REPOS) {
    throw new SpoolOwnerWorktreeCatalogError('resource-limit')
  }
}

function assertWorktreeInventoryCapacity(count: number): void {
  if (count > SPOOL_PUBLICATION_MAX_REGISTERED_WORKTREES) {
    throw new SpoolOwnerWorktreeCatalogError('resource-limit')
  }
}

function assertUniqueCatalogIdentities(targets: readonly SpoolOwnerWorktree[]): void {
  const worktreeIds = new Set<string>()
  const instanceIds = new Set<string>()
  for (const target of targets) {
    if (worktreeIds.has(target.worktreeId) || instanceIds.has(target.instanceId)) {
      throw new SpoolOwnerWorktreeCatalogError('ambiguous')
    }
    worktreeIds.add(target.worktreeId)
    instanceIds.add(target.instanceId)
  }
}
