import type {
  CoworkingProviderQuota,
  CoworkingRemoteDesktop,
  CoworkingSessionCatalogEntry,
  CoworkingWorktreeCatalogEntry
} from '~shared/coworking/catalog-contract'
import { isCoworkingProjectIdentityKey } from '~shared/coworking/catalog-contract'

import { isCoworkingRefExpanded } from '../coworking/selectors'
import type { CoworkingExpandedRefsByDesktop, CoworkingWorkspaceRoute } from '../coworking/types'

export type CoworkingRemoteDesktopSidebarContext = {
  userDisplayName: string
  nodeDisplayName: string
  connectionStatus: CoworkingRemoteDesktop['connectionStatus']
  quota: readonly CoworkingProviderQuota[]
}

export type CoworkingRemoteDesktopStatusSidebarRow = {
  type: 'coworking-desktop-status'
  key: string
  desktopRef: string
  desktop: CoworkingRemoteDesktopSidebarContext
}

export type CoworkingWorktreeSidebarRow = {
  type: 'coworking-worktree'
  kind: CoworkingWorktreeCatalogEntry['kind']
  key: string
  desktopRef: string
  connectionEpoch: number
  projectRef: string
  projectIdentityKey: string | null
  worktreeRef: string
  shareEpoch: string
  desktop: CoworkingRemoteDesktopSidebarContext
  name: string
  branch: string | null
  expanded: boolean
  active: boolean
  sessionCount: number
  sessionCatalogStatus: CoworkingWorktreeCatalogEntry['sessionCatalog']['status']
}

type CoworkingSessionSidebarRowIdentity =
  | Pick<Extract<CoworkingSessionCatalogEntry, { kind: 'terminal' }>, 'kind' | 'agent'>
  | Pick<Extract<CoworkingSessionCatalogEntry, { kind: 'agent' }>, 'kind' | 'agent'>

export type CoworkingSessionSidebarRow = {
  type: 'coworking-session'
  key: string
  desktopRef: string
  connectionEpoch: number
  worktreeRef: string
  sessionRef: string
  title: string
  active: boolean
} & CoworkingSessionSidebarRowIdentity

export type CoworkingSidebarRow =
  | CoworkingRemoteDesktopStatusSidebarRow
  | CoworkingWorktreeSidebarRow
  | CoworkingSessionSidebarRow

export type CoworkingSidebarProjectionInput = {
  desktops: readonly CoworkingRemoteDesktop[]
  expandedWorktreeRefsByDesktop: CoworkingExpandedRefsByDesktop
  activeRoute: CoworkingWorkspaceRoute | null
}

function createCoworkingSidebarRowKey(
  type: CoworkingSidebarRow['type'],
  ...refs: string[]
): string {
  return `coworking:${JSON.stringify([type, ...refs])}`
}

function isActiveWorktree(
  route: CoworkingWorkspaceRoute | null,
  desktopRef: string,
  worktreeRef: string,
  connectionEpoch: number
): boolean {
  return Boolean(
    route &&
    route.desktopRef === desktopRef &&
    route.worktreeRef === worktreeRef &&
    route.connectionEpoch === connectionEpoch
  )
}

export function projectCoworkingSidebarRows(
  input: CoworkingSidebarProjectionInput
): CoworkingSidebarRow[] {
  const rows: CoworkingSidebarRow[] = []
  for (const desktop of input.desktops) {
    const catalog = desktop.catalog
    const sidebarDesktop: CoworkingRemoteDesktopSidebarContext = {
      userDisplayName: desktop.userDisplayName,
      nodeDisplayName: desktop.nodeDisplayName,
      connectionStatus: desktop.connectionStatus,
      quota: catalog?.quota ?? []
    }
    // Why: the desktop row is the Coworking-only remote-host admission point;
    // it must remain reachable whether or not this peer publishes worktrees.
    rows.push({
      type: 'coworking-desktop-status',
      key: createCoworkingSidebarRowKey('coworking-desktop-status', desktop.desktopRef),
      desktopRef: desktop.desktopRef,
      desktop: sidebarDesktop
    })
    if (!catalog) {
      continue
    }
    for (const project of catalog.projects) {
      for (const worktree of project.worktrees) {
        const worktreeActive = isActiveWorktree(
          input.activeRoute,
          desktop.desktopRef,
          worktree.worktreeRef,
          desktop.connectionEpoch
        )
        const worktreeExpanded = isCoworkingRefExpanded(
          input.expandedWorktreeRefsByDesktop,
          desktop.desktopRef,
          worktree.worktreeRef
        )
        rows.push({
          type: 'coworking-worktree',
          kind: worktree.kind,
          key: createCoworkingSidebarRowKey(
            'coworking-worktree',
            desktop.desktopRef,
            project.projectRef,
            worktree.worktreeRef
          ),
          desktopRef: desktop.desktopRef,
          connectionEpoch: desktop.connectionEpoch,
          projectRef: project.projectRef,
          projectIdentityKey: isCoworkingProjectIdentityKey(project.projectRef)
            ? project.projectRef
            : null,
          worktreeRef: worktree.worktreeRef,
          shareEpoch: worktree.shareEpoch,
          desktop: sidebarDesktop,
          name: worktree.name,
          branch: worktree.branch,
          expanded: worktreeExpanded,
          // Why: focused child sessions still belong to the selected Worktree,
          // matching the local card's active surface while an agent row is open.
          active: worktreeActive,
          sessionCount: worktree.sessions.length,
          sessionCatalogStatus: worktree.sessionCatalog.status
        })
        if (!worktreeExpanded) {
          continue
        }
        for (const session of worktree.sessions) {
          const sessionIdentity: CoworkingSessionSidebarRowIdentity = session
          rows.push({
            type: 'coworking-session',
            key: createCoworkingSidebarRowKey(
              'coworking-session',
              desktop.desktopRef,
              worktree.worktreeRef,
              session.sessionRef
            ),
            desktopRef: desktop.desktopRef,
            connectionEpoch: desktop.connectionEpoch,
            worktreeRef: worktree.worktreeRef,
            sessionRef: session.sessionRef,
            ...sessionIdentity,
            title: session.title,
            active: worktreeActive && input.activeRoute?.sessionRef === session.sessionRef
          })
        }
      }
    }
  }
  return rows
}
