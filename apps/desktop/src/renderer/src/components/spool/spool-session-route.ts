import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'

export type SpoolSessionRoute = SpoolWorkspaceRoute & { sessionRef: string }

export function getSpoolSessionRouteKey(route: SpoolSessionRoute): string {
  // Why: all remote refs are opaque, so a serialized tuple cannot collide on a delimiter.
  return JSON.stringify([
    route.desktopRef,
    route.worktreeRef,
    route.connectionEpoch,
    route.sessionRef
  ])
}

export function isSameSpoolSessionRoute(
  candidate: SpoolWorkspaceRoute | null,
  expected: SpoolSessionRoute
): boolean {
  return Boolean(
    candidate &&
    candidate.desktopRef === expected.desktopRef &&
    candidate.connectionEpoch === expected.connectionEpoch &&
    candidate.worktreeRef === expected.worktreeRef &&
    candidate.sessionRef === expected.sessionRef
  )
}
