import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import type { DetectedWorktreeListResult, WorktreeLineage, WorkspaceLineage } from '~shared/types'

import type { AppState } from '../types'
import { findRepoForHost } from './repo-host-identity'
import { toLegacyDetectedWorktreeResult } from './worktree-host-model'
import { isRuntimeMethodNotFoundError } from './worktree-known-model'
import {
  REMOTE_WORKTREE_LIST_PARITY_LIMIT,
  detectedWorktreeRefreshesInFlight,
  type BackgroundRuntimeRefreshOptions
} from './worktree-refresh-model'
import { findWorktreeById, getRepoIdFromWorktreeId } from './worktree-state'

export function settingsForRepoOwner(
  state: Pick<AppState, 'repos' | 'settings'>,
  repoId: string,
  hostId?: ExecutionHostId | null
) {
  const repo = findRepoForHost(state.repos, repoId, { hostId, settings: state.settings })
  if (!repo) {
    return state.settings
  }
  return settingsForKnownRepoOwner(state.settings, repo)
}

export function settingsForKnownRepoOwner(
  settings: AppState['settings'],
  repo: { connectionId?: string | null; executionHostId?: ExecutionHostId | null }
) {
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — only executionHostId can still make a repo non-local.
  if (!repo.executionHostId) {
    return settings
  }
  const parsed = parseExecutionHostId(getRepoExecutionHostId(repo))
  if (parsed?.kind === 'runtime') {
    return settings
      ? { ...settings, activeRuntimeEnvironmentId: parsed.environmentId }
      : ({ activeRuntimeEnvironmentId: parsed.environmentId } as AppState['settings'])
  }
  if (parsed?.kind === 'local' && settings?.activeRuntimeEnvironmentId) {
    return { ...settings, activeRuntimeEnvironmentId: null }
  }
  return settings
}

export function settingsForExecutionHostOwner(
  settings: AppState['settings'],
  executionHostId: string | null | undefined
) {
  const parsed = parseExecutionHostId(executionHostId)
  if (parsed?.kind === 'runtime') {
    return settings
      ? { ...settings, activeRuntimeEnvironmentId: parsed.environmentId }
      : ({ activeRuntimeEnvironmentId: parsed.environmentId } as AppState['settings'])
  }
  if (parsed?.kind === 'local') {
    return settings
      ? { ...settings, activeRuntimeEnvironmentId: null }
      : ({ activeRuntimeEnvironmentId: null } as AppState['settings'])
  }
  return settings
}

export function settingsForWorktreeOwner(
  state: Pick<AppState, 'repos' | 'settings' | 'worktreesByRepo' | 'detectedWorktreesByRepo'>,
  worktreeId: string
) {
  const worktree = findWorktreeById(state.worktreesByRepo, worktreeId)
  if (worktree?.hostId) {
    return settingsForExecutionHostOwner(state.settings, worktree.hostId)
  }
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const detected = state.detectedWorktreesByRepo[repoId]?.worktrees.find(
    (entry) => entry.id === worktreeId
  )
  if (detected?.hostId) {
    return settingsForExecutionHostOwner(state.settings, detected.hostId)
  }
  return settingsForRepoOwner(state, repoId)
}

export async function listDetectedWorktreesForRepo(
  settings: AppState['settings'],
  repoId: string,
  options: BackgroundRuntimeRefreshOptions = {}
): Promise<DetectedWorktreeListResult> {
  const target = getActiveRuntimeTarget(settings)
  if (target.kind === 'local') {
    const worktreesApi = workspaceHostClient.worktrees as typeof workspaceHostClient.worktrees & {
      listDetected?: typeof workspaceHostClient.worktrees.listDetected
    }
    if (typeof worktreesApi.listDetected === 'function') {
      return worktreesApi.listDetected({ repoId })
    }
    const legacyWorktrees = await worktreesApi.list({ repoId })
    return toLegacyDetectedWorktreeResult(repoId, { worktrees: legacyWorktrees })
  }
  try {
    return await callRuntimeOrpc(
      target,
      (client) => client.worktree.detectedList,
      { repo: repoId },
      {
        timeoutMs: 15_000,
        reuseRecentCompatibilityFailure: options.reuseRecentCompatibilityFailure
      }
    )
  } catch (error) {
    if (!isRuntimeMethodNotFoundError(error)) {
      throw error
    }
    const legacy = await callRuntimeOrpc(
      target,
      (client) => client.worktree.list,
      { repo: repoId, limit: REMOTE_WORKTREE_LIST_PARITY_LIMIT },
      {
        timeoutMs: 15_000,
        reuseRecentCompatibilityFailure: options.reuseRecentCompatibilityFailure
      }
    )
    return toLegacyDetectedWorktreeResult(repoId, legacy)
  }
}

export function detectedWorktreeRefreshKey(
  settings: AppState['settings'],
  repoId: string,
  options: {
    executionHostId: ExecutionHostId
    requireAuthoritative?: boolean
    reuseRecentCompatibilityFailure?: boolean
  }
): string {
  const target = getActiveRuntimeTarget(settings)
  const targetKey = target.kind === 'local' ? 'local' : `runtime:${target.environmentId}`
  const parts = [
    repoId,
    options.executionHostId,
    targetKey,
    options.requireAuthoritative === true ? 'authoritative' : 'best-effort'
  ]
  // Why: only remote targets run a compat preflight, so a foreground (reuse:false)
  // refresh must not coalesce onto a background reuse:true scan that reused a
  // stale failure — it must re-probe. Local targets have no preflight; keep them
  // coalesced so a foreground/background collision stays one git scan.
  if (target.kind === 'environment') {
    parts.push(options.reuseRecentCompatibilityFailure === true ? 'reuse-failure' : 'reprobe')
  }
  return parts.join('\n')
}

export async function listDetectedWorktreesForRepoCoalesced(
  settings: AppState['settings'],
  repoId: string,
  options: {
    executionHostId: ExecutionHostId
    requireAuthoritative?: boolean
    reuseRecentCompatibilityFailure?: boolean
  }
): Promise<DetectedWorktreeListResult> {
  const key = detectedWorktreeRefreshKey(settings, repoId, options)
  const existing = detectedWorktreeRefreshesInFlight.get(key)
  if (existing) {
    return existing
  }
  // Why: startup/event fan-out can ask for the same repo/host refresh many
  // times at once; share only the scan promise so state merge semantics stay local.
  const refresh = listDetectedWorktreesForRepo(settings, repoId, {
    reuseRecentCompatibilityFailure: options.reuseRecentCompatibilityFailure
  })
  detectedWorktreeRefreshesInFlight.set(key, refresh)
  try {
    return await refresh
  } finally {
    if (detectedWorktreeRefreshesInFlight.get(key) === refresh) {
      detectedWorktreeRefreshesInFlight.delete(key)
    }
  }
}

export async function listWorktreeLineageForRuntime(
  settings: AppState['settings'],
  options: BackgroundRuntimeRefreshOptions = {}
): Promise<{
  worktreeLineageById: Record<string, WorktreeLineage>
  workspaceLineageByChildKey: Record<string, WorkspaceLineage>
}> {
  const target = getActiveRuntimeTarget(settings)
  type LineageListResponse = {
    lineage?: Record<string, WorktreeLineage>
    workspaceLineage?: Record<string, WorkspaceLineage>
  }
  const normalizeLineageResponse = (
    value: Record<string, WorktreeLineage> | LineageListResponse
  ) =>
    Object.prototype.hasOwnProperty.call(value, 'lineage') ||
    Object.prototype.hasOwnProperty.call(value, 'workspaceLineage')
      ? {
          worktreeLineageById: (value as LineageListResponse).lineage ?? {},
          workspaceLineageByChildKey: (value as LineageListResponse).workspaceLineage ?? {}
        }
      : {
          worktreeLineageById: value as Record<string, WorktreeLineage>,
          workspaceLineageByChildKey: {}
        }
  if (target.kind === 'local') {
    return normalizeLineageResponse(await workspaceHostClient.worktrees.listLineage())
  }
  return normalizeLineageResponse(
    await callRuntimeOrpc(target, (client) => client.worktree.lineageList, undefined, {
      timeoutMs: 15_000,
      reuseRecentCompatibilityFailure: options.reuseRecentCompatibilityFailure
    })
  )
}
