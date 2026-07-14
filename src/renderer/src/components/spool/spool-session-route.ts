import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'

export type SpoolSessionRoute = SpoolWorkspaceRoute & { sessionRef: string }

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
