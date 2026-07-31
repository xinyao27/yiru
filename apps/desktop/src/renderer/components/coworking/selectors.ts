import type {
  CoworkingProjectCatalogEntry,
  CoworkingRemoteDesktop,
  CoworkingSessionCatalogEntry,
  CoworkingWorktreeCatalogEntry
} from '~shared/coworking/catalog-contract'
import type { CoworkingRequesterControlView } from '~shared/coworking/ipc-contract'

import type {
  CoworkingExpandedRefsByDesktop,
  CoworkingSharingState,
  CoworkingWorkspaceRoute
} from './types'

type CoworkingDesktopState = Pick<CoworkingSharingState, 'coworkingRemoteDesktops'>

export type ResolvedCoworkingWorkspaceRoute = {
  desktop: CoworkingRemoteDesktop
  project: CoworkingProjectCatalogEntry
  worktree: CoworkingWorktreeCatalogEntry
  session: CoworkingSessionCatalogEntry | null
}

export type ResolvedCoworkingWorktreeRoute = Omit<ResolvedCoworkingWorkspaceRoute, 'session'>

export function getCoworkingWorktreeBindingKey(desktopRef: string, worktreeRef: string): string {
  return JSON.stringify([desktopRef, worktreeRef])
}

export function isCoworkingRefExpanded(
  refsByDesktop: CoworkingExpandedRefsByDesktop,
  desktopRef: string,
  resourceRef: string
): boolean {
  return refsByDesktop.get(desktopRef)?.has(resourceRef) ?? false
}

export function resolveCoworkingWorktreeRoute(
  state: CoworkingDesktopState,
  route: CoworkingWorkspaceRoute
): ResolvedCoworkingWorktreeRoute | null {
  const desktop = state.coworkingRemoteDesktops.find(
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
    return { desktop, project, worktree }
  }
  return null
}

export function resolveCoworkingWorkspaceRoute(
  state: CoworkingDesktopState,
  route: CoworkingWorkspaceRoute
): ResolvedCoworkingWorkspaceRoute | null {
  const resolved = resolveCoworkingWorktreeRoute(state, route)
  if (!resolved) {
    return null
  }
  const session = route.sessionRef
    ? (resolved.worktree.sessions.find((candidate) => candidate.sessionRef === route.sessionRef) ??
      null)
    : null
  // Why: session pagination is rebuilt after an owner resumes an agent; keep
  // the selected worktree surface mounted while its stable terminal handoff attaches.
  return { ...resolved, session }
}

export function isCoworkingRequesterControlCurrent(
  desktops: readonly CoworkingRemoteDesktop[],
  binding: CoworkingRequesterControlView
): boolean {
  const resolved = resolveCoworkingWorkspaceRoute(
    { coworkingRemoteDesktops: desktops },
    {
      desktopRef: binding.desktopRef,
      worktreeRef: binding.worktreeRef,
      connectionEpoch: binding.connectionEpoch
    }
  )
  return Boolean(resolved && resolved.desktop.connectionStatus === 'connected')
}

export function selectActiveCoworkingWorkspace(
  state: CoworkingDesktopState & Pick<CoworkingSharingState, 'activeCoworkingWorkspaceRoute'>
): ResolvedCoworkingWorkspaceRoute | null {
  return state.activeCoworkingWorkspaceRoute
    ? resolveCoworkingWorkspaceRoute(state, state.activeCoworkingWorkspaceRoute)
    : null
}

export function selectCoworkingCanControl(
  state: Pick<
    CoworkingSharingState,
    'coworkingRemoteDesktops' | 'coworkingRequesterControlByWorktree'
  >,
  route: CoworkingWorkspaceRoute | null
): boolean {
  if (!route) {
    return false
  }
  const binding = state.coworkingRequesterControlByWorktree.get(
    getCoworkingWorktreeBindingKey(route.desktopRef, route.worktreeRef)
  )
  return Boolean(
    binding &&
    binding.status === 'granted' &&
    binding.connectionEpoch === route.connectionEpoch &&
    isCoworkingRequesterControlCurrent(state.coworkingRemoteDesktops, binding)
  )
}

export function selectCoworkingRequesterControlState(
  state: Pick<
    CoworkingSharingState,
    'coworkingRemoteDesktops' | 'coworkingRequesterControlByWorktree'
  >,
  route: CoworkingWorkspaceRoute | null
): CoworkingRequesterControlView['status'] {
  if (!route) {
    return 'read-only'
  }
  const binding = state.coworkingRequesterControlByWorktree.get(
    getCoworkingWorktreeBindingKey(route.desktopRef, route.worktreeRef)
  )
  return binding &&
    binding.connectionEpoch === route.connectionEpoch &&
    isCoworkingRequesterControlCurrent(state.coworkingRemoteDesktops, binding)
    ? binding.status
    : 'read-only'
}
