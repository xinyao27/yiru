import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import { splitWorktreeIdForFilesystem } from '@yiru/workbench-model/workspace'
import type { Store } from '~main/persistence'
import type { OrchestrationDb } from '~main/runtime/orchestration/db'
import { mergeWorktree, areWorktreePathsEqual } from '~main/worktree/logic'
import type { Repo, WorktreeLineage, WorkspaceLineage, WorkspaceKey } from '~shared/types'
import { worktreeWorkspaceKey } from '~shared/workspace/scope'

import { runtimePathsEqual } from '../model/worktree-identity'
import { extractOrchestrationTaskId } from '../model/worktree-resolution'
import type { ResolvedWorktree, WorktreeLineageCandidate } from '../model/worktree-resolution'
import { findLocalRepoById } from '../model/worktree-storage'
import { RuntimeWorktreeResolveLineageForWorktreeCreate } from './resolve-lineage-for-worktree-create'

export abstract class RuntimeWorktreeResolveLineageCandidateForTaskId extends RuntimeWorktreeResolveLineageForWorktreeCreate {
  protected async resolveLineageCandidateForTaskId(
    taskId: string
  ): Promise<WorktreeLineageCandidate | null> {
    const db = this.getOrchestrationDbIfAvailable()
    const dispatch = db?.getDispatchContext(taskId)
    // Why: agent-created task records may never be dispatched, but the
    // creating terminal still identifies the parent workspace for descendants.
    const parentHandle =
      dispatch?.assignee_handle ?? db?.getTask(taskId)?.created_by_terminal_handle
    if (!parentHandle) {
      return null
    }
    try {
      const terminal = await this.showTerminal(parentHandle)
      const parent = await this.resolveWorktreeSelector(`id:${terminal.worktreeId}`)
      return {
        source: 'orchestration-context',
        parent: {
          type: 'worktree',
          workspaceKey: worktreeWorkspaceKey(parent.id),
          worktree: parent,
          instanceId: parent.instanceId ?? null
        },
        taskId
      }
    } catch {
      return null
    }
  }

  protected getOrchestrationDbIfAvailable(): OrchestrationDb | null {
    try {
      return this._orchestrationDb ?? this.getOrchestrationDb()
    } catch {
      return this._orchestrationDb
    }
  }

  async hydrateInferredWorktreeLineage(): Promise<void> {
    const store = this.store
    if (
      !store ||
      typeof store.getWorktreeLineage !== 'function' ||
      typeof store.setWorktreeLineage !== 'function'
    ) {
      return
    }

    const worktrees = await this.listResolvedWorktrees()
    for (const worktree of worktrees) {
      if (store.getWorktreeLineage(worktree.id) || !worktree.instanceId) {
        continue
      }
      const taskId = extractOrchestrationTaskId(worktree.comment)
      if (!taskId) {
        continue
      }
      const candidate = await this.resolveLineageCandidateForTaskId(taskId)
      if (
        !candidate?.parent.instanceId ||
        candidate.parent.type !== 'worktree' ||
        candidate.parent.worktree.id === worktree.id
      ) {
        continue
      }
      try {
        this.validateLineageParent(worktree, candidate.parent.worktree)
      } catch {
        continue
      }
      store.setWorktreeLineage(worktree.id, {
        worktreeId: worktree.id,
        worktreeInstanceId: worktree.instanceId,
        parentWorktreeId: candidate.parent.worktree.id,
        parentWorktreeInstanceId: candidate.parent.instanceId,
        origin: 'orchestration',
        capture: { source: 'orchestration-context', confidence: 'inferred' },
        taskId,
        createdAt: Date.now()
      })
    }
  }

  async listWorktreeLineage(): Promise<Record<string, WorktreeLineage>> {
    await this.hydrateInferredWorktreeLineage()
    return this.store?.getAllWorktreeLineage?.() ?? {}
  }

  async listWorkspaceLineage(): Promise<Record<WorkspaceKey, WorkspaceLineage>> {
    await this.hydrateInferredWorktreeLineage()
    return this.store?.getAllWorkspaceLineage?.() ?? {}
  }

  protected async resolveRepoSelector(
    selector: string,
    executionHostId?: ExecutionHostId
  ): Promise<Repo> {
    if (!this.store) {
      throw new Error('repo_not_found')
    }
    const requestedHostId = executionHostId ?? LOCAL_EXECUTION_HOST_ID
    const repos = this.store
      .getRepos()
      .filter((repo) => getRepoExecutionHostId(repo) === requestedHostId)
    let candidates: Repo[]

    if (selector.startsWith('id:')) {
      candidates = repos.filter((repo) => repo.id === selector.slice(3))
    } else if (selector.startsWith('path:')) {
      candidates = repos.filter((repo) => runtimePathsEqual(repo.path, selector.slice(5)))
    } else if (selector.startsWith('name:')) {
      candidates = repos.filter((repo) => repo.displayName === selector.slice(5))
    } else {
      candidates = repos.filter(
        (repo) =>
          repo.id === selector ||
          runtimePathsEqual(repo.path, selector) ||
          repo.displayName === selector
      )
    }

    if (candidates.length === 1) {
      return candidates[0]
    }
    if (candidates.length > 1) {
      throw new Error('selector_ambiguous')
    }
    throw new Error('repo_not_found')
  }

  protected requireStore(): Store {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    return this.store as unknown as Store
  }

  protected buildResolvedWorktreeFromId(worktreeId: string): ResolvedWorktree | null {
    const parsed = splitWorktreeIdForFilesystem(worktreeId)
    if (!parsed?.repoId || !parsed.worktreePath) {
      return null
    }
    const repo = this.store ? findLocalRepoById(this.store, parsed.repoId) : undefined
    const git = {
      path: parsed.worktreePath,
      head: '',
      branch: '',
      isBare: false,
      isMainWorktree: repo ? areWorktreePathsEqual(parsed.worktreePath, repo.path) : false
    }
    const meta = this.store?.getWorktreeMeta(worktreeId)
    const merged = mergeWorktree(parsed.repoId, git, meta, repo?.displayName)
    return {
      ...merged,
      id: worktreeId,
      parentWorktreeId: null,
      childWorktreeIds: [],
      lineage: null,
      git,
      displayName: merged.displayName,
      comment: merged.comment
    }
  }
}
