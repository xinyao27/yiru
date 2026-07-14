import { getRepoExecutionHostId, parseExecutionHostId } from '../../shared/execution-host'
import { getProjectHostSetupForRepo } from '../../shared/project-host-setup-projection'
import { isFolderRepo } from '../../shared/repo-kind'
import { getRepoIdFromWorktreeId } from '../../shared/worktree-id'
import type {
  DetectedWorktree,
  DetectedWorktreeListResult,
  ProjectHostSetup,
  Repo,
  WorktreeMeta
} from '../../shared/types'
import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'
import {
  SpoolOwnerWorktreeCatalogError,
  type SpoolOwnerWorktreeCatalog,
  type SpoolOwnerWorktreeCatalogInventory
} from './spool-worktree-publication-validation'

type SpoolWorktreeRuntime = Pick<OrcaRuntimeService, 'listDetectedManagedWorktrees'>

export type DefaultSpoolOwnerWorktreeCatalogOptions = {
  store: Store
  runtime: SpoolWorktreeRuntime
  listRuntimeWorktrees?: (environmentId: string, repo: Repo) => Promise<DetectedWorktreeListResult>
}

/** Reads every registered Git root from the host that actually owns it. */
export class DefaultSpoolOwnerWorktreeCatalog implements SpoolOwnerWorktreeCatalog {
  private readonly store: Store
  private readonly runtime: SpoolWorktreeRuntime

  constructor(private readonly options: DefaultSpoolOwnerWorktreeCatalogOptions) {
    this.store = options.store
    this.runtime = options.runtime
  }

  async getWorktree(worktreeId: string): Promise<SpoolOwnerWorktree | null> {
    const repo = this.store.getRepo(getRepoIdFromWorktreeId(worktreeId))
    if (!repo || isFolderRepo(repo)) {
      return null
    }
    return (
      (await this.readAuthoritativeRepo(repo)).find((entry) => entry.worktreeId === worktreeId) ??
      null
    )
  }

  async getWorktreeByInstance(instanceId: string): Promise<SpoolOwnerWorktree | null> {
    const worktreeIds = Object.entries(this.store.getAllWorktreeMeta()).flatMap(
      ([worktreeId, meta]) => (meta.instanceId === instanceId ? [worktreeId] : [])
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
    const repos = this.store
      .getRepos()
      .filter(
        (repo) => !isFolderRepo(repo) && repoMayContainProject(repo, projectId, setups, metas)
      )
    const targets = (
      await Promise.all(repos.map((repo) => this.readAuthoritativeRepo(repo)))
    ).flat()
    assertUniqueCatalogIdentities(targets)
    return targets.filter((entry) => entry.projectId === projectId)
  }

  async inspectRegisteredWorktrees(): Promise<SpoolOwnerWorktreeCatalogInventory> {
    const setups = this.store.getProjectHostSetups()
    const detectedByRepo = await Promise.all(
      this.store
        .getRepos()
        .filter((repo) => !isFolderRepo(repo))
        .map(async (repo) => await this.inspectRepo(repo, setups))
    )
    const targets = detectedByRepo.flatMap((entry) => entry.targets)
    assertUniqueCatalogIdentities(targets)
    return {
      worktrees: targets,
      unavailableExecutionHostIds: [
        ...new Set(
          detectedByRepo.flatMap((entry) =>
            entry.authoritative ? [] : [getRepoExecutionHostId(entry.repo)]
          )
        )
      ]
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

  private async inspectRepo(
    repo: Repo,
    setups: readonly ProjectHostSetup[]
  ): Promise<{ repo: Repo; authoritative: boolean; targets: readonly SpoolOwnerWorktree[] }> {
    let detected: DetectedWorktreeListResult
    try {
      detected = await this.listDetected(repo)
    } catch {
      return { repo, authoritative: false, targets: [] }
    }
    if (!detected.authoritative || detected.repoId !== repo.id) {
      return { repo, authoritative: false, targets: [] }
    }
    if (detected.worktrees.some((worktree) => worktree.repoId !== repo.id)) {
      return { repo, authoritative: false, targets: [] }
    }
    try {
      const targets = detected.worktrees.flatMap((worktree) => {
        const target = projectRegisteredWorktree(
          repo,
          worktree,
          this.store.getWorktreeMeta(worktree.id),
          setups
        )
        return target ? [target] : []
      })
      return { repo, authoritative: true, targets }
    } catch {
      // Why: malformed metadata on one host cannot collapse unrelated host inventories.
      return { repo, authoritative: false, targets: [] }
    }
  }

  private async listDetected(repo: Repo): Promise<DetectedWorktreeListResult> {
    const host = parseExecutionHostId(getRepoExecutionHostId(repo))
    if (host?.kind === 'runtime') {
      if (!this.options.listRuntimeWorktrees) {
        throw new Error('spool_runtime_worktree_catalog_unavailable')
      }
      return await this.options.listRuntimeWorktrees(host.environmentId, repo)
    }
    return await this.runtime.listDetectedManagedWorktrees(`id:${repo.id}`)
  }
}

function projectRegisteredWorktree(
  repo: Repo,
  worktree: DetectedWorktree,
  meta: WorktreeMeta | undefined,
  setups: readonly ProjectHostSetup[]
): SpoolOwnerWorktree | null {
  if (!meta?.instanceId || (worktree.instanceId && worktree.instanceId !== meta.instanceId)) {
    return null
  }
  const setup = getProjectHostSetupForRepo(setups, repo)
  const repoExecutionHostId = getRepoExecutionHostId(repo)
  const runtimeBacked = parseExecutionHostId(repoExecutionHostId)?.kind === 'runtime'
  return {
    kind: 'git',
    worktreeId: worktree.id,
    instanceId: meta.instanceId,
    projectId: worktree.projectId ?? meta.projectId ?? setup.projectId,
    repoId: repo.id,
    // Why: detected runtime rows describe the inner host; the owner gateway
    // must route through the outer paired runtime and let it resolve that host.
    executionHostId: runtimeBacked
      ? repoExecutionHostId
      : (worktree.hostId ?? meta.hostId ?? repoExecutionHostId),
    ...(!runtimeBacked && repo.connectionId !== undefined
      ? { connectionId: repo.connectionId }
      : {}),
    projectHostSetupId: worktree.projectHostSetupId ?? meta.projectHostSetupId ?? setup.id,
    worktreePath: worktree.path
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

function repoMayContainProject(
  repo: Repo,
  projectId: string,
  setups: readonly ProjectHostSetup[],
  metas: Readonly<Record<string, WorktreeMeta>>
): boolean {
  if (getProjectHostSetupForRepo(setups, repo).projectId === projectId) {
    return true
  }
  return Object.entries(metas).some(
    ([worktreeId, meta]) =>
      getRepoIdFromWorktreeId(worktreeId) === repo.id && meta.projectId === projectId
  )
}
