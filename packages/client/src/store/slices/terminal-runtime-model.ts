import { WINDOWS_GIT_BASH_SHELL } from '@yiru/workbench-model/platform'
import { isWslUncPath } from '@yiru/workbench-model/platform'
import { getFolderWorkspaceConnectionId } from '~renderer/components/editor/folder-workspace-connection'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/lib/worktree-runtime-owner'
import { resolveLocalWindowsTerminalShellOverrideForTab } from '~shared/local-windows-terminal-runtime'
import type { ProjectExecutionRuntimeResolution } from '~shared/project-execution-runtime'
import { parseLegacyNumericPaneKey, parsePaneKey } from '~shared/stable-pane-id'
import type { TerminalLayoutSnapshot } from '~shared/types'
import { parseWorkspaceKey } from '~shared/workspace/scope'

import type { AppState } from '../types'

export function getTabIdFromPaneKey(paneKey: string): string | null {
  return parsePaneKey(paneKey)?.tabId ?? parseLegacyNumericPaneKey(paneKey)?.tabId ?? null
}

export function isWindowsRendererRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
}

export function isAllowedRemoteWindowsTerminalShell(shell: string | undefined): boolean {
  return (
    shell === 'powershell.exe' ||
    shell === 'pwsh.exe' ||
    shell === 'cmd.exe' ||
    shell === 'wsl.exe' ||
    shell === WINDOWS_GIT_BASH_SHELL
  )
}

export function resolveCreatedTabShellOverride(
  explicitShellOverride: string | undefined,
  defaultWindowsShell: string | undefined,
  isRemoteWorktree: boolean,
  remotePlatform: NodeJS.Platform | null,
  isWslWorktree: boolean,
  projectRuntime: ProjectExecutionRuntimeResolution | undefined
): string | undefined {
  if (isRemoteWorktree) {
    if (remotePlatform === 'win32' && isAllowedRemoteWindowsTerminalShell(explicitShellOverride)) {
      return explicitShellOverride
    }
    return undefined
  }
  if (isWindowsRendererRuntime()) {
    return resolveLocalWindowsTerminalShellOverrideForTab({
      explicitShellOverride,
      defaultWindowsShell,
      isWslWorktree,
      projectRuntime
    })
  }
  if (explicitShellOverride !== undefined) {
    return explicitShellOverride
  }
  return undefined
}

export function worktreeUsesWslPath(
  state: Pick<AppState, 'folderWorkspaces' | 'worktreesByRepo'>,
  worktreeId: string
): boolean {
  const parsed = parseWorkspaceKey(worktreeId)
  if (parsed?.type === 'folder') {
    const folderWorkspace = state.folderWorkspaces.find(
      (workspace) => workspace.id === parsed.folderWorkspaceId
    )
    return folderWorkspace ? isWslUncPath(folderWorkspace.folderPath) : false
  }
  const worktree = Object.values(state.worktreesByRepo)
    .flat()
    .find((entry) => entry.id === worktreeId)
  return worktree ? isWslUncPath(worktree.path) : false
}

export function worktreeUsesRemoteConnection(
  state: Pick<AppState, 'folderWorkspaces' | 'projectGroups' | 'repos' | 'worktreesByRepo'>,
  worktreeId: string
): boolean {
  const parsedWorkspaceKey = parseWorkspaceKey(worktreeId)
  if (parsedWorkspaceKey?.type === 'folder') {
    return Boolean(getFolderWorkspaceConnectionId(state, parsedWorkspaceKey.folderWorkspaceId))
  }
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — so a plain (non-folder) worktree can never be remote.
  return false
}

export function getRemoteConnectionIdForWorktree(
  state: Pick<AppState, 'folderWorkspaces' | 'projectGroups' | 'repos' | 'worktreesByRepo'>,
  worktreeId: string
): string | null {
  const parsedWorkspaceKey = parseWorkspaceKey(worktreeId)
  if (parsedWorkspaceKey?.type === 'folder') {
    return getFolderWorkspaceConnectionId(state, parsedWorkspaceKey.folderWorkspaceId) ?? null
  }
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — so a plain (non-folder) worktree can never carry one.
  return null
}

export function resolveTerminalStopRuntimeEnvironmentId(
  state: Pick<AppState, 'repos' | 'settings' | 'worktreesByRepo'>,
  worktreeId: string
): string | null {
  return getRuntimeEnvironmentIdForWorktree(state, worktreeId)
}

export function sortedUniquePtyIds(ptyIds: readonly string[] | undefined): string[] {
  return [...new Set((ptyIds ?? []).filter((ptyId) => ptyId.length > 0))].sort()
}

export function equalStringSets(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  const bSet = new Set(b)
  return a.every((value) => bSet.has(value))
}

export function uniquePtyIds(ptyIds: readonly (string | null | undefined)[]): string[] {
  return [...new Set(ptyIds.filter((ptyId): ptyId is string => Boolean(ptyId)))]
}

export function resolvePrimaryLayoutPtyId(layout: TerminalLayoutSnapshot): string | null {
  const ptyIdsByLeafId = layout.ptyIdsByLeafId ?? {}
  const activePtyId = layout.activeLeafId ? ptyIdsByLeafId[layout.activeLeafId] : undefined
  return activePtyId ?? Object.values(ptyIdsByLeafId)[0] ?? null
}
