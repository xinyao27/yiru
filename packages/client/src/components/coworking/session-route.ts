import type { CoworkingWorkspaceRoute } from '~renderer/components/coworking/types'

export type CoworkingSessionRoute = CoworkingWorkspaceRoute & { sessionRef: string }

export function getCoworkingSessionRouteKey(route: CoworkingSessionRoute): string {
  // Why: all remote refs are opaque, so a serialized tuple cannot collide on a delimiter.
  return JSON.stringify([
    route.desktopRef,
    route.worktreeRef,
    route.connectionEpoch,
    route.sessionRef
  ])
}

export function isSameCoworkingSessionRoute(
  candidate: CoworkingWorkspaceRoute | null,
  expected: CoworkingSessionRoute
): boolean {
  return Boolean(
    candidate &&
    candidate.desktopRef === expected.desktopRef &&
    candidate.connectionEpoch === expected.connectionEpoch &&
    candidate.worktreeRef === expected.worktreeRef &&
    candidate.sessionRef === expected.sessionRef
  )
}
