import type {
  SpoolProjectCatalogEntry,
  SpoolRemoteDesktop,
  SpoolSessionCatalogEntry,
  SpoolWorktreeCatalogEntry
} from '../../../../shared/spool/spool-catalog-contract'
import type { SpoolControlRequest } from '../../../../shared/spool/spool-access-contract'
import type {
  SpoolControlGrantBinding,
  SpoolExpandedRefsByDesktop,
  SpoolSharingState,
  SpoolWorkspaceRoute
} from './spool-sharing-types'

type SpoolDesktopState = Pick<SpoolSharingState, 'spoolRemoteDesktops'>

export type ResolvedSpoolWorkspaceRoute = {
  desktop: SpoolRemoteDesktop
  project: SpoolProjectCatalogEntry
  worktree: SpoolWorktreeCatalogEntry
  session: SpoolSessionCatalogEntry | null
}

export function getSpoolWorktreeBindingKey(desktopRef: string, worktreeRef: string): string {
  return JSON.stringify([desktopRef, worktreeRef])
}

export function isSpoolRefExpanded(
  refsByDesktop: SpoolExpandedRefsByDesktop,
  desktopRef: string,
  resourceRef: string
): boolean {
  return refsByDesktop.get(desktopRef)?.has(resourceRef) ?? false
}

export function resolveSpoolWorkspaceRoute(
  state: SpoolDesktopState,
  route: SpoolWorkspaceRoute
): ResolvedSpoolWorkspaceRoute | null {
  const desktop = state.spoolRemoteDesktops.find(
    (candidate) =>
      candidate.desktopRef === route.desktopRef &&
      candidate.connectionEpoch === route.connectionEpoch
  )
  if (!desktop?.catalog) {
    return null
  }
  for (const project of desktop.catalog.projects) {
    const worktree = project.worktrees.find(
      (candidate) => candidate.worktreeRef === route.worktreeRef
    )
    if (!worktree) {
      continue
    }
    const session = route.sessionRef
      ? (worktree.sessions.find((candidate) => candidate.sessionRef === route.sessionRef) ?? null)
      : null
    if (route.sessionRef && !session) {
      return null
    }
    return { desktop, project, worktree, session }
  }
  return null
}

export function isSpoolControlGrantBindingCurrent(
  desktops: readonly SpoolRemoteDesktop[],
  binding: SpoolControlGrantBinding
): boolean {
  const resolved = resolveSpoolWorkspaceRoute(
    { spoolRemoteDesktops: desktops },
    {
      desktopRef: binding.desktopRef,
      worktreeRef: binding.worktreeRef,
      connectionEpoch: binding.connectionEpoch
    }
  )
  return Boolean(
    resolved &&
    resolved.desktop.connectionStatus === 'connected' &&
    resolved.desktop.catalog?.ownerRuntimeId === binding.grant.ownerRuntimeId &&
    resolved.worktree.shareEpoch === binding.grant.shareEpoch
  )
}

export function selectActiveSpoolWorkspace(
  state: SpoolDesktopState & Pick<SpoolSharingState, 'activeSpoolWorkspaceRoute'>
): ResolvedSpoolWorkspaceRoute | null {
  return state.activeSpoolWorkspaceRoute
    ? resolveSpoolWorkspaceRoute(state, state.activeSpoolWorkspaceRoute)
    : null
}

export function selectSpoolCanControl(
  state: Pick<SpoolSharingState, 'spoolRemoteDesktops' | 'spoolControlGrantsByWorktree'>,
  route: SpoolWorkspaceRoute | null
): boolean {
  if (!route) {
    return false
  }
  const binding = state.spoolControlGrantsByWorktree.get(
    getSpoolWorktreeBindingKey(route.desktopRef, route.worktreeRef)
  )
  return Boolean(
    binding &&
    binding.connectionEpoch === route.connectionEpoch &&
    isSpoolControlGrantBindingCurrent(state.spoolRemoteDesktops, binding)
  )
}

export function selectCurrentSpoolControlRequest(
  state: Pick<SpoolSharingState, 'spoolControlRequestQueue'>
): SpoolControlRequest | null {
  return state.spoolControlRequestQueue[0] ?? null
}
