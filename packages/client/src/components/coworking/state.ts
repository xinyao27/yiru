import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'
import type { CoworkingRequesterControlView } from '~shared/coworking/ipc-contract'

import {
  getCoworkingWorktreeBindingKey,
  isCoworkingRequesterControlCurrent,
  resolveCoworkingWorkspaceRoute
} from './selectors'
import type {
  CoworkingExpandedRefsByDesktop,
  CoworkingSharingSlice,
  CoworkingSharingState
} from './types'

export type {
  CoworkingExpandedRefsByDesktop,
  CoworkingSharingActions,
  CoworkingSharingSlice,
  CoworkingSharingState,
  CoworkingWorkspaceRoute
} from './types'
export {
  getCoworkingWorktreeBindingKey,
  isCoworkingRefExpanded,
  resolveCoworkingWorkspaceRoute,
  selectActiveCoworkingWorkspace,
  selectCoworkingCanControl,
  selectCoworkingRequesterControlState
} from './selectors'

function createInitialCoworkingSharingState(): CoworkingSharingState {
  return {
    coworkingSharingStatus: 'starting',
    coworkingSharingDiagnostic: null,
    coworkingSelfIdentity: null,
    coworkingRemoteDesktops: [],
    coworkingOwnerWorktrees: [],
    coworkingOwnerControlGrants: [],
    coworkingOwnerActiveConnections: [],
    coworkingExpandedWorktreeRefsByDesktop: new Map(),
    activeCoworkingWorkspaceRoute: null,
    coworkingControlRequestQueue: [],
    coworkingHostAccessRequestQueue: [],
    coworkingRequesterControlByWorktree: new Map()
  }
}

function updateExpandedResourceRefs(
  current: CoworkingExpandedRefsByDesktop,
  desktopRef: string,
  resourceRef: string,
  expanded: boolean
): CoworkingExpandedRefsByDesktop {
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
  desktops: AppState['coworkingRemoteDesktops'],
  current: AppState['coworkingRequesterControlByWorktree']
): AppState['coworkingRequesterControlByWorktree'] {
  const next = new Map(current)
  for (const [key, binding] of current) {
    if (!isCoworkingRequesterControlCurrent(desktops, binding)) {
      next.delete(key)
    }
  }
  return next
}

function requesterControlMap(
  controls: readonly CoworkingRequesterControlView[]
): AppState['coworkingRequesterControlByWorktree'] {
  return new Map(
    controls.map((control) => [
      getCoworkingWorktreeBindingKey(control.desktopRef, control.worktreeRef),
      control
    ])
  )
}

export const createCoworkingSharingSlice: StateCreator<AppState, [], [], CoworkingSharingSlice> = (
  set
) => ({
  ...createInitialCoworkingSharingState(),

  applyCoworkingSharingSnapshot: (snapshot) =>
    set((state) => {
      const coworkingRemoteDesktops = [...snapshot.remoteDesktops]
      const activeCoworkingWorkspaceRoute =
        state.activeCoworkingWorkspaceRoute &&
        resolveCoworkingWorkspaceRoute(
          { coworkingRemoteDesktops },
          state.activeCoworkingWorkspaceRoute
        )
          ? state.activeCoworkingWorkspaceRoute
          : null
      return {
        coworkingSharingStatus: snapshot.status,
        coworkingSharingDiagnostic: snapshot.diagnostic,
        coworkingSelfIdentity: snapshot.self,
        coworkingRemoteDesktops,
        coworkingOwnerWorktrees: [...snapshot.ownerWorktrees],
        coworkingOwnerControlGrants: [...snapshot.ownerControlGrants],
        coworkingOwnerActiveConnections: [...snapshot.ownerActiveConnections],
        coworkingControlRequestQueue: [...snapshot.ownerControlRequests],
        coworkingHostAccessRequestQueue: [...snapshot.ownerHostAccessRequests],
        activeCoworkingWorkspaceRoute,
        // Why: requester control is a main-process projection bound to the
        // physical connection; replacing it wholesale prevents stale grants.
        coworkingRequesterControlByWorktree: requesterControlMap(snapshot.requesterControlStates)
      }
    }),

  setCoworkingRemoteDesktops: (desktops) =>
    set((state) => {
      const coworkingRemoteDesktops = [...desktops]
      const activeCoworkingWorkspaceRoute =
        state.activeCoworkingWorkspaceRoute &&
        resolveCoworkingWorkspaceRoute(
          { coworkingRemoteDesktops },
          state.activeCoworkingWorkspaceRoute
        )
          ? state.activeCoworkingWorkspaceRoute
          : null
      return {
        coworkingRemoteDesktops,
        activeCoworkingWorkspaceRoute,
        // Why: connection, runtime, and share epochs are all authority bounds;
        // one catalog transition must demote every renderer surface together.
        coworkingRequesterControlByWorktree: projectCurrentRequesterControl(
          coworkingRemoteDesktops,
          state.coworkingRequesterControlByWorktree
        )
      }
    }),

  setCoworkingWorktreeExpanded: (desktopRef, worktreeRef, expanded) =>
    set((state) => ({
      coworkingExpandedWorktreeRefsByDesktop: updateExpandedResourceRefs(
        state.coworkingExpandedWorktreeRefsByDesktop,
        desktopRef,
        worktreeRef,
        expanded
      )
    })),

  setActiveCoworkingWorkspaceRoute: (activeCoworkingWorkspaceRoute) =>
    set({ activeCoworkingWorkspaceRoute }),

  enqueueCoworkingControlRequest: (request) =>
    set((state) =>
      state.coworkingControlRequestQueue.some(
        (candidate) => candidate.requestId === request.requestId
      )
        ? state
        : { coworkingControlRequestQueue: [...state.coworkingControlRequestQueue, request] }
    ),

  removeCoworkingControlRequest: (requestId) =>
    set((state) => ({
      coworkingControlRequestQueue: state.coworkingControlRequestQueue.filter(
        (request) => request.requestId !== requestId
      )
    })),

  markCoworkingControlPending: (route) =>
    set((state) => {
      if (!resolveCoworkingWorkspaceRoute(state, route)) {
        return state
      }
      const key = getCoworkingWorktreeBindingKey(route.desktopRef, route.worktreeRef)
      const current = state.coworkingRequesterControlByWorktree.get(key)
      if (current?.connectionEpoch === route.connectionEpoch && current.status === 'granted') {
        // Why: the authoritative control stream can grant access before the
        // request invoke resolves; its ACK must never downgrade that grant.
        return state
      }
      const next = new Map(state.coworkingRequesterControlByWorktree)
      next.set(key, {
        desktopRef: route.desktopRef,
        worktreeRef: route.worktreeRef,
        connectionEpoch: route.connectionEpoch,
        status: 'pending'
      })
      return { coworkingRequesterControlByWorktree: next }
    }),

  clearCoworkingConnectionAuthority: (desktopRef, connectionEpoch) =>
    set((state) => {
      const next = new Map(state.coworkingRequesterControlByWorktree)
      for (const [key, binding] of next) {
        if (
          binding.desktopRef === desktopRef &&
          (connectionEpoch === undefined || binding.connectionEpoch === connectionEpoch)
        ) {
          next.delete(key)
        }
      }
      return { coworkingRequesterControlByWorktree: next }
    }),

  resetCoworkingSharing: () => set(createInitialCoworkingSharingState())
})
