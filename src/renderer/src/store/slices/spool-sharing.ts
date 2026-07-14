import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import {
  getSpoolWorktreeBindingKey,
  isSpoolControlGrantBindingCurrent,
  resolveSpoolWorkspaceRoute
} from './spool-sharing-selectors'
import type {
  SpoolControlGrantBinding,
  SpoolExpandedRefsByDesktop,
  SpoolSharingSlice,
  SpoolSharingState
} from './spool-sharing-types'

export type {
  SpoolControlGrantBinding,
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
  selectSpoolCanControl
} from './spool-sharing-selectors'

function createInitialSpoolSharingState(): SpoolSharingState {
  return {
    spoolRemoteDesktops: [],
    spoolExpandedDesktopRefs: new Set(),
    spoolExpandedProjectRefsByDesktop: new Map(),
    spoolExpandedWorktreeRefsByDesktop: new Map(),
    activeSpoolWorkspaceRoute: null,
    spoolControlRequestQueue: [],
    spoolControlGrantsByWorktree: new Map()
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

function retainCurrentSpoolGrants(
  desktops: AppState['spoolRemoteDesktops'],
  current: ReadonlyMap<string, SpoolControlGrantBinding>
): ReadonlyMap<string, SpoolControlGrantBinding> {
  const next = new Map<string, SpoolControlGrantBinding>()
  for (const [key, binding] of current) {
    if (isSpoolControlGrantBindingCurrent(desktops, binding)) {
      next.set(key, binding)
    }
  }
  return next
}

export const createSpoolSharingSlice: StateCreator<AppState, [], [], SpoolSharingSlice> = (
  set
) => ({
  ...createInitialSpoolSharingState(),

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
        spoolControlGrantsByWorktree: retainCurrentSpoolGrants(
          spoolRemoteDesktops,
          state.spoolControlGrantsByWorktree
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

  setSpoolControlGrant: (binding) =>
    set((state) => {
      const next = new Map(state.spoolControlGrantsByWorktree)
      next.set(getSpoolWorktreeBindingKey(binding.desktopRef, binding.worktreeRef), binding)
      return { spoolControlGrantsByWorktree: next }
    }),

  removeSpoolControlGrant: (grantId) =>
    set((state) => {
      const next = new Map(state.spoolControlGrantsByWorktree)
      for (const [key, binding] of next) {
        if (binding.grant.grantId === grantId) {
          next.delete(key)
        }
      }
      return { spoolControlGrantsByWorktree: next }
    }),

  clearSpoolConnectionAuthority: (desktopRef, connectionEpoch) =>
    set((state) => {
      const next = new Map(state.spoolControlGrantsByWorktree)
      for (const [key, binding] of next) {
        if (
          binding.desktopRef === desktopRef &&
          (connectionEpoch === undefined || binding.connectionEpoch === connectionEpoch)
        ) {
          next.delete(key)
        }
      }
      return { spoolControlGrantsByWorktree: next }
    }),

  resetSpoolSharing: () => set(createInitialSpoolSharingState())
})
