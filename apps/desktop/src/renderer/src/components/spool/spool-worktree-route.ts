import { useMemo } from 'react'

import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'

export type SpoolWorktreeRoute = Pick<
  SpoolWorkspaceRoute,
  'desktopRef' | 'worktreeRef' | 'connectionEpoch'
>

export function getSpoolWorktreeRouteKey(route: SpoolWorktreeRoute): string {
  // Why: remote refs are opaque strings, so a serialized tuple cannot collide on a delimiter.
  return JSON.stringify([route.desktopRef, route.worktreeRef, route.connectionEpoch])
}

export function useSpoolWorktreeOperationRoute(route: SpoolWorkspaceRoute): SpoolWorktreeRoute {
  return useMemo(
    () => ({
      desktopRef: route.desktopRef,
      worktreeRef: route.worktreeRef,
      connectionEpoch: route.connectionEpoch
    }),
    [route.connectionEpoch, route.desktopRef, route.worktreeRef]
  )
}
