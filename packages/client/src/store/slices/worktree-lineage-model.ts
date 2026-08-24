import {
  getRepoExecutionHostId,
  getSettingsFocusedExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import type { StateCreator } from 'zustand'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'
import type { WorktreeLineage, WorkspaceLineage } from '~shared/types'
import { parseWorkspaceKey, worktreeWorkspaceKey } from '~shared/workspace/scope'

import type { AppState } from '../types'
import { findRepoForHost } from './repo-host-identity'
import { withRepoHostOwnership, repoHostId, type WorktreeWithLineage } from './worktree-host-model'
import { replaceWorktreeInRepoLists } from './worktree-known-model'
import type { BackgroundRuntimeRefreshOptions } from './worktree-refresh-model'
import { listWorktreeLineageForRuntime } from './worktree-runtime-list-model'
import { findWorktreeById, getRepoIdFromWorktreeId } from './worktree-state'

export function projectWorktreeLineageToWorkspaceLineage(
  worktreeId: string,
  lineage: WorktreeLineage | null,
  current: Record<string, WorkspaceLineage>
): Record<string, WorkspaceLineage> {
  const childWorkspaceKey = worktreeWorkspaceKey(worktreeId)
  const next = { ...current }
  if (!lineage) {
    delete next[childWorkspaceKey]
    return next
  }
  next[childWorkspaceKey] = {
    childWorkspaceKey,
    childInstanceId: lineage.worktreeInstanceId,
    parentWorkspaceKey: worktreeWorkspaceKey(lineage.parentWorktreeId),
    parentInstanceId: lineage.parentWorktreeInstanceId,
    origin: lineage.origin,
    capture: lineage.capture,
    ...(lineage.taskId ? { taskId: lineage.taskId } : {}),
    ...(lineage.orchestrationRunId ? { orchestrationRunId: lineage.orchestrationRunId } : {}),
    ...(lineage.coordinatorHandle ? { coordinatorHandle: lineage.coordinatorHandle } : {}),
    ...(lineage.createdByTerminalHandle
      ? { createdByTerminalHandle: lineage.createdByTerminalHandle }
      : {}),
    createdAt: lineage.createdAt
  }
  return next
}

export type WorktreeLineageUpdateResult = {
  target: ReturnType<typeof getActiveRuntimeTarget>
  lineage: WorktreeLineage | null
  updatedRemoteWorktree?: WorktreeWithLineage
}

export async function setWorktreeLineageForRuntime(
  settings: AppState['settings'],
  worktreeId: string,
  args: { parentWorktreeId?: string; noParent?: boolean }
): Promise<WorktreeLineageUpdateResult> {
  const target = getActiveRuntimeTarget(settings)
  // Why: the local IPC handler for `worktrees:updateLineage` already delegates
  // to `runtime.updateManagedWorktreeMeta` — the exact method `worktree.set`
  // calls on the environment path — so routing local through the same oRPC
  // call is not a behavior change, just one fewer preload channel.
  const result = await callRuntimeOrpc(
    target,
    (client) => client.worktree.set,
    {
      worktree: toRuntimeWorktreeSelector(worktreeId),
      ...(args.parentWorktreeId
        ? { parentWorktree: toRuntimeWorktreeSelector(args.parentWorktreeId) }
        : {}),
      ...(args.noParent === true ? { noParent: true } : {})
    },
    { timeoutMs: 15_000 }
  )
  return {
    target,
    lineage: result.worktree.lineage ?? null,
    updatedRemoteWorktree: result.worktree
  }
}

export function applyWorktreeLineageUpdate(
  set: Parameters<StateCreator<AppState>>[0],
  worktreeId: string,
  result: WorktreeLineageUpdateResult
): void {
  set((s) => {
    const next = { ...s.worktreeLineageById }
    if (result.lineage) {
      next[worktreeId] = result.lineage
    } else {
      delete next[worktreeId]
    }
    return {
      worktreeLineageById: next,
      workspaceLineageByChildKey: projectWorktreeLineageToWorkspaceLineage(
        worktreeId,
        result.lineage,
        s.workspaceLineageByChildKey
      ),
      worktreesByRepo:
        result.target.kind === 'local' || !result.updatedRemoteWorktree
          ? s.worktreesByRepo
          : replaceWorktreeInRepoLists(
              s.worktreesByRepo,
              withRepoHostOwnership(
                result.updatedRemoteWorktree,
                repoHostId(s, getRepoIdFromWorktreeId(result.updatedRemoteWorktree.id))
              )
            ),
      sortEpoch: s.sortEpoch + 1
    }
  })
}

export async function refreshWorktreeLineageForSettings(
  settings: AppState['settings'],
  set: Parameters<StateCreator<AppState>>[0],
  options: BackgroundRuntimeRefreshOptions = {}
): Promise<void> {
  const lineage = await listWorktreeLineageForRuntime(settings, options)
  const hostId = getSettingsFocusedExecutionHostId(settings)
  set((s) => ({
    worktreeLineageById: mergeLineageForHost(s, hostId, lineage.worktreeLineageById),
    workspaceLineageByChildKey: mergeWorkspaceLineageForHost(
      s,
      hostId,
      lineage.workspaceLineageByChildKey
    )
  }))
}

export async function refreshRemoteWorktreeLineageBestEffort(
  settings: AppState['settings'],
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
): Promise<void> {
  if (getActiveRuntimeTarget(settings).kind === 'local') {
    return
  }
  try {
    const lineage = await listWorktreeLineageForRuntime(settings, {
      reuseRecentCompatibilityFailure: true
    })
    const hostId = getSettingsFocusedExecutionHostId(settings)
    set((s) => ({
      worktreeLineageById: mergeLineageForHost(s, hostId, lineage.worktreeLineageById),
      workspaceLineageByChildKey: mergeWorkspaceLineageForHost(
        s,
        hostId,
        lineage.workspaceLineageByChildKey
      )
    }))
  } catch (err) {
    // Why: lineage is supplemental to the worktree list. A remote timeout here
    // must not discard a successful worktree refresh.
    console.error('Failed to fetch worktree lineage:', err)
  }
}

export function getWorktreeHostId(
  state: Pick<AppState, 'repos' | 'settings' | 'worktreesByRepo' | 'detectedWorktreesByRepo'>,
  worktreeId: string
): ExecutionHostId | null {
  const worktree = findWorktreeById(state.worktreesByRepo, worktreeId)
  if (worktree?.hostId) {
    return worktree.hostId
  }
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const detected = state.detectedWorktreesByRepo[repoId]?.worktrees.find(
    (entry) => entry.id === worktreeId
  )
  if (detected?.hostId) {
    return detected.hostId
  }
  const repo = findRepoForHost(state.repos, repoId, { settings: state.settings })
  return repo ? getRepoExecutionHostId(repo) : null
}

export function resolveWorktreeRemovalHost(
  state: Pick<AppState, 'repos' | 'settings' | 'worktreesByRepo' | 'detectedWorktreesByRepo'>,
  worktreeId: string
): { hostId: ExecutionHostId | null; ambiguous: boolean } {
  const hostIds = new Set<ExecutionHostId>()
  for (const worktrees of Object.values(state.worktreesByRepo)) {
    for (const worktree of worktrees) {
      if (worktree.id === worktreeId && worktree.hostId) {
        hostIds.add(worktree.hostId)
      }
    }
  }
  for (const result of Object.values(state.detectedWorktreesByRepo)) {
    for (const worktree of result.worktrees) {
      if (worktree.id === worktreeId && worktree.hostId) {
        hostIds.add(worktree.hostId)
      }
    }
  }
  if (hostIds.size > 1) {
    return { hostId: null, ambiguous: true }
  }
  if (hostIds.size === 1) {
    return { hostId: hostIds.values().next().value ?? null, ambiguous: false }
  }

  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const repoHostIds = new Set(
    state.repos.filter((repo) => repo.id === repoId).map(getRepoExecutionHostId)
  )
  return repoHostIds.size > 1
    ? { hostId: null, ambiguous: true }
    : { hostId: repoHostIds.values().next().value ?? null, ambiguous: false }
}

export function mergeLineageForHost(
  state: Pick<
    AppState,
    'repos' | 'settings' | 'worktreesByRepo' | 'detectedWorktreesByRepo' | 'worktreeLineageById'
  >,
  hostId: ExecutionHostId,
  lineage: Record<string, WorktreeLineage>
): Record<string, WorktreeLineage> {
  const next: Record<string, WorktreeLineage> = {}
  for (const [worktreeId, existing] of Object.entries(state.worktreeLineageById)) {
    if (getWorktreeHostId(state, worktreeId) !== hostId) {
      next[worktreeId] = existing
    }
  }
  return { ...next, ...lineage }
}

export function mergeWorkspaceLineageForHost(
  state: Pick<
    AppState,
    | 'repos'
    | 'settings'
    | 'worktreesByRepo'
    | 'detectedWorktreesByRepo'
    | 'workspaceLineageByChildKey'
  >,
  hostId: ExecutionHostId,
  lineage: Record<string, WorkspaceLineage>
): Record<string, WorkspaceLineage> {
  const next: Record<string, WorkspaceLineage> = {}
  for (const [childKey, existing] of Object.entries(state.workspaceLineageByChildKey)) {
    const childScope = parseWorkspaceKey(existing.childWorkspaceKey)
    const childHostId =
      childScope?.type === 'worktree' ? getWorktreeHostId(state, childScope.worktreeId) : null
    // A focused host refresh can no longer prove unknown-host child rows are current.
    if (childScope?.type !== 'worktree' || (childHostId !== null && childHostId !== hostId)) {
      next[childKey] = existing
    }
  }
  return { ...next, ...lineage }
}
