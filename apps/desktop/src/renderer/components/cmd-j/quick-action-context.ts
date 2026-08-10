import { translate } from '~renderer/i18n/i18n'
import { findWorktreeById } from '~renderer/store/slices/worktree-helpers'
import type { AppState } from '~renderer/store/types'
import type { CoworkingOwnerWorktreeSharing } from '~shared/coworking/ipc-contract'
import type { Worktree } from '~shared/types'

export type CmdJUnavailableReason =
  | 'loading'
  | 'no-active-workspace'
  | 'coworking-unavailable'
  | 'no-active-group'

export type CmdJQuickActionAvailability =
  | { available: true }
  | { available: false; reason: CmdJUnavailableReason }

export type CmdJActiveGroupSnapshot = {
  worktreeId: string
  groupId: string | null
}

export type CmdJQuickActionContext = {
  activeView: AppState['activeView']
  activeWorktreeId: string | null
  activeWorktree: Worktree | null
  coworkingOwnerWorktree: CoworkingOwnerWorktreeSharing | null
  isLoading: boolean
  runtimeMode: 'local-desktop' | 'paired-web'
  activeGroupId: string | null
  openNewBrowserTab: (groupId: string) => Promise<void>
  openNewMarkdownFile: (groupId: string) => Promise<void>
  openNewTerminalTab: (groupId: string) => Promise<void>
  openCreateWorkspace: () => void
  deleteActiveWorkspace: () => void
  openAddQuickCommand: () => void
  openCoworkingSettings: () => void
  toggleCoworkingVisibility: () => Promise<void>
}

export function resolveCmdJActiveGroupId(
  state: Pick<AppState, 'activeGroupIdByWorktree' | 'groupsByWorktree'>,
  worktreeId: string | null,
  snapshot?: CmdJActiveGroupSnapshot | null
): string | null {
  if (!worktreeId) {
    return null
  }
  const groups = state.groupsByWorktree[worktreeId] ?? []
  if (groups.length === 0) {
    return null
  }

  if (snapshot?.worktreeId === worktreeId) {
    if (snapshot.groupId && groups.some((group) => group.id === snapshot.groupId)) {
      return snapshot.groupId
    }
    return groups[0]?.id ?? null
  }

  const focusedGroupId = state.activeGroupIdByWorktree[worktreeId]
  if (focusedGroupId && groups.some((group) => group.id === focusedGroupId)) {
    return focusedGroupId
  }
  return groups[0]?.id ?? null
}

export function captureCmdJActiveGroupSnapshot(
  state: Pick<AppState, 'activeGroupIdByWorktree' | 'groupsByWorktree'>,
  worktreeId: string | null
): CmdJActiveGroupSnapshot | null {
  if (!worktreeId) {
    return null
  }
  return {
    worktreeId,
    groupId: resolveCmdJActiveGroupId(state, worktreeId)
  }
}

export function getWorkspaceScopedActionAvailability(
  ctx: Pick<CmdJQuickActionContext, 'activeGroupId' | 'activeWorktreeId' | 'isLoading'>
): CmdJQuickActionAvailability {
  const worktreeAvailability = getActiveWorktreeActionAvailability(ctx)
  if (!worktreeAvailability.available) {
    return worktreeAvailability
  }
  if (!ctx.activeGroupId) {
    return { available: false, reason: 'no-active-group' }
  }
  return { available: true }
}

export function getActiveWorktreeActionAvailability(
  ctx: Pick<CmdJQuickActionContext, 'activeWorktreeId' | 'isLoading'>
): CmdJQuickActionAvailability {
  if (!ctx.activeWorktreeId) {
    return { available: false, reason: 'no-active-workspace' }
  }
  if (ctx.isLoading) {
    return { available: false, reason: 'loading' }
  }
  return { available: true }
}

export function getCurrentWorkspaceActionAvailability(
  ctx: Pick<CmdJQuickActionContext, 'activeView' | 'activeWorktreeId' | 'isLoading'>
): CmdJQuickActionAvailability {
  if (ctx.activeView !== 'terminal' || !ctx.activeWorktreeId) {
    return { available: false, reason: 'no-active-workspace' }
  }
  return getActiveWorktreeActionAvailability(ctx)
}

export function findCoworkingOwnerWorktree(
  ownerWorktrees: AppState['coworkingOwnerWorktrees'],
  worktreeId: string | null
): CoworkingOwnerWorktreeSharing | null {
  if (!worktreeId) {
    return null
  }
  return ownerWorktrees.find((entry) => entry.worktreeId === worktreeId) ?? null
}

export function buildCmdJQuickActionContext(args: {
  state: AppState
  activeGroupSnapshot: CmdJActiveGroupSnapshot | null
  openNewBrowserTab: (groupId: string) => Promise<void>
  openNewMarkdownFile: (groupId: string) => Promise<void>
  openNewTerminalTab: (groupId: string) => Promise<void>
  openCreateWorkspace: () => void
  deleteActiveWorkspace: () => void
  openAddQuickCommand: () => void
  openCoworkingSettings: () => void
  toggleCoworkingVisibility: () => Promise<void>
}): CmdJQuickActionContext {
  const activeWorktreeId = args.state.activeWorktreeId
  const activeWorktree = activeWorktreeId
    ? (findWorktreeById(args.state.worktreesByRepo, activeWorktreeId) ?? null)
    : null
  const coworkingOwnerWorktree = findCoworkingOwnerWorktree(
    args.state.coworkingOwnerWorktrees,
    activeWorktreeId
  )
  const activeGroupId = resolveCmdJActiveGroupId(
    args.state,
    activeWorktreeId,
    args.activeGroupSnapshot
  )
  const isLoading =
    args.state.repos.length > 0 && Object.keys(args.state.worktreesByRepo).length === 0
  const runtimeMode =
    (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ &&
    args.state.settings?.activeRuntimeEnvironmentId?.trim()
      ? 'paired-web'
      : 'local-desktop'

  return {
    activeView: args.state.activeView,
    activeWorktreeId,
    activeWorktree,
    coworkingOwnerWorktree,
    isLoading,
    runtimeMode,
    activeGroupId,
    openNewBrowserTab: args.openNewBrowserTab,
    openNewMarkdownFile: args.openNewMarkdownFile,
    openNewTerminalTab: args.openNewTerminalTab,
    openCreateWorkspace: args.openCreateWorkspace,
    deleteActiveWorkspace: args.deleteActiveWorkspace,
    openAddQuickCommand: args.openAddQuickCommand,
    openCoworkingSettings: args.openCoworkingSettings,
    toggleCoworkingVisibility: args.toggleCoworkingVisibility
  }
}

export function getUnavailableQuickActionMessage(
  actionTitle: string,
  reason: CmdJUnavailableReason
): string {
  switch (reason) {
    case 'loading':
      return `Can't ${actionTitle.toLowerCase()} — workspace is still loading.`
    case 'no-active-workspace':
      return `Can't ${actionTitle.toLowerCase()} — no workspace is active.`
    case 'coworking-unavailable':
      return `Can't ${actionTitle.toLowerCase()} — ${translate(
        'auto.components.cmd.j.quick.action.context.coworkingUnavailable',
        'Coworking is unavailable here.'
      )}`
    case 'no-active-group':
      return `Can't ${actionTitle.toLowerCase()} — no tab group is available.`
  }
}
