import { useMemo } from 'react'

import type { CoworkingWorkspaceRoute } from '@/components/coworking/types'

export type CoworkingWorktreeRoute = Pick<
  CoworkingWorkspaceRoute,
  'desktopRef' | 'worktreeRef' | 'connectionEpoch'
>

export function getCoworkingWorktreeRouteKey(route: CoworkingWorktreeRoute): string {
  // Why: remote refs are opaque strings, so a serialized tuple cannot collide on a delimiter.
  return JSON.stringify([route.desktopRef, route.worktreeRef, route.connectionEpoch])
}

export function useCoworkingWorktreeOperationRoute(
  route: CoworkingWorkspaceRoute
): CoworkingWorktreeRoute {
  return useMemo(
    () => ({
      desktopRef: route.desktopRef,
      worktreeRef: route.worktreeRef,
      connectionEpoch: route.connectionEpoch
    }),
    [route.connectionEpoch, route.desktopRef, route.worktreeRef]
  )
}
