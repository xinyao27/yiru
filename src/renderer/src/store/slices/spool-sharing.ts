import type { StateCreator } from 'zustand'
import type { SpoolRequesterControlView } from '../../../../shared/spool/spool-ipc-contract'
import type { AppState } from '../types'
import {
  getSpoolWorktreeBindingKey,
  isSpoolRequesterControlCurrent,
  resolveSpoolWorkspaceRoute
} from './spool-sharing-selectors'
import type {
  SpoolExpandedRefsByDesktop,
  SpoolSharingSlice,
  SpoolSharingState
} from './spool-sharing-types'

export type {
  SpoolExpandedRefsByDesktop,
  SpoolSharingActions,
  SpoolSharingSlice,
  SpoolSharingState,
  SpoolWorkspaceRoute
} from './spool-sharing-types'
export {
  getSpoolWorktreeBindingKey,
  isSpoolRefExpanded,
  resolveSpoolWorkspaceRoute,
  selectActiveSpoolWorkspace,
  selectCurrentSpoolControlRequest,
  selectSpoolCanControl,
  selectSpoolRequesterControlState
} from './spool-sharing-selectors'

function createInitialSpoolSharingState(): SpoolSharingState {
  return {
    spoolSharingStatus: 'starting',
    spoolSharingDiagnostic: null,
    spoolRemoteDesktops: [],
    spoolOwnerWorktrees: [],
    spoolOwnerControlGrants: [],
    spoolExpandedDesktopRefs: new Set(),
    spoolExpandedProjectRefsByDesktop: new Map(),
    spoolExpandedWorktreeRefsByDesktop: new Map(),
    activeSpoolWorkspaceRoute: null,
    spoolControlRequestQueue: [],
    spoolRequesterControlByWorktree: new Map()
  }
}

function updateExpandedDesktopRefs(
  current: ReadonlySet<string>,
  desktopRef: string,
  expanded: boolean
): ReadonlySet<string> {
  if (current.has(desktopRef) === expanded) {
    return current
  }
  const next = new Set(current)
  if (expanded) {
    next.add(desktopRef)
  } else {
    next.delete(desktopRef)
  }
  return next
}

function updateExpandedResourceRefs(
  current: SpoolExpandedRefsByDesktop,
  desktopRef: string,
  resourceRef: string,
  expanded: boolean
): SpoolExpandedRefsByDesktop {
  const currentRefs = current.get(desktopRef) ?? new Set<string>()
  if (currentRefs.has(resourceRef) === expanded) {
    return current
  }
  const nextRefs = new Set(currentRefs)
  if (expanded) {
    nextRefs.add(resourceRef)
  } else {
    nextRefs.delete(resourceRef)
  }
  const next = new Map(current)
  if (nextRefs.size > 0) {
    next.set(desktopRef, nextRefs)
  } else {
    next.delete(desktopRef)
  }
  return next
}

function projectCurrentRequesterControl(
  desktops: AppState['spoolRemoteDesktops'],
  current: AppState['spoolRequesterControlByWorktree']
): AppState['spoolRequesterControlByWorktree'] {
  const next = new Map(current)
  for (const [key, binding] of current) {
    if (!isSpoolRequesterControlCurrent(desktops, binding)) {
      next.delete(key)
    }
  }
  return next
}

function requesterControlMap(
  controls: readonly SpoolRequesterControlView[]
): AppState['spoolRequesterControlByWorktree'] {
  return new Map(
    controls.map((control) => [
      getSpoolWorktreeBindingKey(control.desktopRef, control.worktreeRef),
      control
    ])
  )
}

export const createSpoolSharingSlice: StateCreator<AppState, [], [], SpoolSharingSlice> = (
  set
) => ({
  ...createInitialSpoolSharingState(),

  applySpoolSharingSnapshot: (snapshot) =>
    set((state) => {
      const spoolRemoteDesktops = [...snapshot.remoteDesktops]
      const activeSpoolWorkspaceRoute =
        state.activeSpoolWorkspaceRoute &&
        resolveSpoolWorkspaceRoute({ spoolRemoteDesktops }, state.activeSpoolWorkspaceRoute)
          ? state.activeSpoolWorkspaceRoute
          : null
      return {
        spoolSharingStatus: snapshot.status,
        spoolSharingDiagnostic: snapshot.diagnostic,
        spoolRemoteDesktops,
        spoolOwnerWorktrees: [...snapshot.ownerWorktrees],
        spoolOwnerControlGrants: [...snapshot.ownerControlGrants],
        spoolControlRequestQueue: [...snapshot.ownerControlRequests],
        activeSpoolWorkspaceRoute,
        // Why: requester control is a main-process projection bound to the
        // physical connection; replacing it wholesale prevents stale grants.
        spoolRequesterControlByWorktree: requesterControlMap(snapshot.requesterControlStates)
      }
    }),

  setSpoolRemoteDesktops: (desktops) =>
    set((state) => {
      const spoolRemoteDesktops = [...desktops]
      const activeSpoolWorkspaceRoute =
        state.activeSpoolWorkspaceRoute &&
        resolveSpoolWorkspaceRoute({ spoolRemoteDesktops }, state.activeSpoolWorkspaceRoute)
          ? state.activeSpoolWorkspaceRoute
          : null
      return {
        spoolRemoteDesktops,
        activeSpoolWorkspaceRoute,
        // Why: connection, runtime, and share epochs are all authority bounds;
        // one catalog transition must demote every renderer surface together.
        spoolRequesterControlByWorktree: projectCurrentRequesterControl(
          spoolRemoteDesktops,
          state.spoolRequesterControlByWorktree
        )
      }
    }),

  setSpoolDesktopExpanded: (desktopRef, expanded) =>
    set((state) => ({
      spoolExpandedDesktopRefs: updateExpandedDesktopRefs(
        state.spoolExpandedDesktopRefs,
        desktopRef,
        expanded
      )
    })),

  setSpoolProjectExpanded: (desktopRef, projectRef, expanded) =>
    set((state) => ({
      spoolExpandedProjectRefsByDesktop: updateExpandedResourceRefs(
        state.spoolExpandedProjectRefsByDesktop,
        desktopRef,
        projectRef,
        expanded
      )
    })),

  setSpoolWorktreeExpanded: (desktopRef, worktreeRef, expanded) =>
    set((state) => ({
      spoolExpandedWorktreeRefsByDesktop: updateExpandedResourceRefs(
        state.spoolExpandedWorktreeRefsByDesktop,
        desktopRef,
        worktreeRef,
        expanded
      )
    })),

  setActiveSpoolWorkspaceRoute: (activeSpoolWorkspaceRoute) => set({ activeSpoolWorkspaceRoute }),

  enqueueSpoolControlRequest: (request) =>
    set((state) =>
      state.spoolControlRequestQueue.some((candidate) => candidate.requestId === request.requestId)
        ? state
        : { spoolControlRequestQueue: [...state.spoolControlRequestQueue, request] }
    ),

  removeSpoolControlRequest: (requestId) =>
    set((state) => ({
      spoolControlRequestQueue: state.spoolControlRequestQueue.filter(
        (request) => request.requestId !== requestId
      )
    })),

  markSpoolControlPending: (route) =>
    set((state) => {
      if (!resolveSpoolWorkspaceRoute(state, route)) {
        return state
      }
      const key = getSpoolWorktreeBindingKey(route.desktopRef, route.worktreeRef)
      const current = state.spoolRequesterControlByWorktree.get(key)
      if (current?.connectionEpoch === route.connectionEpoch && current.status === 'granted') {
        // Why: the authoritative control stream can grant access before the
        // request invoke resolves; its ACK must never downgrade that grant.
        return state
      }
      const next = new Map(state.spoolRequesterControlByWorktree)
      next.set(key, {
        desktopRef: route.desktopRef,
        worktreeRef: route.worktreeRef,
        connectionEpoch: route.connectionEpoch,
        status: 'pending'
      })
      return { spoolRequesterControlByWorktree: next }
    }),

  clearSpoolConnectionAuthority: (desktopRef, connectionEpoch) =>
    set((state) => {
      const next = new Map(state.spoolRequesterControlByWorktree)
      for (const [key, binding] of next) {
        if (
          binding.desktopRef === desktopRef &&
          (connectionEpoch === undefined || binding.connectionEpoch === connectionEpoch)
        ) {
          next.delete(key)
        }
      }
      return { spoolRequesterControlByWorktree: next }
    }),

  resetSpoolSharing: () => set(createInitialSpoolSharingState())
})
