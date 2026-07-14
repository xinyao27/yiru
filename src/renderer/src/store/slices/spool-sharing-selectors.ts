import type {
  SpoolProjectCatalogEntry,
  SpoolRemoteDesktop,
  SpoolSessionCatalogEntry,
  SpoolWorktreeCatalogEntry
} from '../../../../shared/spool/spool-catalog-contract'
import type { SpoolRequesterControlView } from '../../../../shared/spool/spool-ipc-contract'
import type {
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

export function isSpoolRequesterControlCurrent(
  desktops: readonly SpoolRemoteDesktop[],
  binding: SpoolRequesterControlView
): boolean {
  const resolved = resolveSpoolWorkspaceRoute(
    { spoolRemoteDesktops: desktops },
    {
      desktopRef: binding.desktopRef,
      worktreeRef: binding.worktreeRef,
      connectionEpoch: binding.connectionEpoch
    }
  )
  return Boolean(resolved && resolved.desktop.connectionStatus === 'connected')
}

export function selectActiveSpoolWorkspace(
  state: SpoolDesktopState & Pick<SpoolSharingState, 'activeSpoolWorkspaceRoute'>
): ResolvedSpoolWorkspaceRoute | null {
  return state.activeSpoolWorkspaceRoute
    ? resolveSpoolWorkspaceRoute(state, state.activeSpoolWorkspaceRoute)
    : null
}

export function selectSpoolCanControl(
  state: Pick<SpoolSharingState, 'spoolRemoteDesktops' | 'spoolRequesterControlByWorktree'>,
  route: SpoolWorkspaceRoute | null
): boolean {
  if (!route) {
    return false
  }
  const binding = state.spoolRequesterControlByWorktree.get(
    getSpoolWorktreeBindingKey(route.desktopRef, route.worktreeRef)
  )
  return Boolean(
    binding &&
    binding.status === 'granted' &&
    binding.connectionEpoch === route.connectionEpoch &&
    isSpoolRequesterControlCurrent(state.spoolRemoteDesktops, binding)
  )
}

export function selectSpoolRequesterControlState(
  state: Pick<SpoolSharingState, 'spoolRemoteDesktops' | 'spoolRequesterControlByWorktree'>,
  route: SpoolWorkspaceRoute | null
): SpoolRequesterControlView['status'] {
  if (!route) {
    return 'read-only'
  }
  const binding = state.spoolRequesterControlByWorktree.get(
    getSpoolWorktreeBindingKey(route.desktopRef, route.worktreeRef)
  )
  return binding &&
    binding.connectionEpoch === route.connectionEpoch &&
    isSpoolRequesterControlCurrent(state.spoolRemoteDesktops, binding)
    ? binding.status
    : 'read-only'
}
