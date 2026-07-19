import type {
  SpoolProviderQuota,
  SpoolRemoteDesktop,
  SpoolSessionCatalogEntry,
  SpoolWorktreeCatalogEntry
} from '../../../../shared/spool/spool-catalog-contract'
import { isSpoolProjectIdentityKey } from '../../../../shared/spool/spool-catalog-contract'
import { isSpoolRefExpanded } from '../../store/slices/spool-sharing-selectors'
import type {
  SpoolExpandedRefsByDesktop,
  SpoolWorkspaceRoute
} from '../../store/slices/spool-sharing-types'

export type SpoolRemoteDesktopSidebarContext = {
  userDisplayName: string
  nodeDisplayName: string
  connectionStatus: SpoolRemoteDesktop['connectionStatus']
  quota: readonly SpoolProviderQuota[]
}

export type SpoolRemoteDesktopStatusSidebarRow = {
  type: 'spool-desktop-status'
  key: string
  desktopRef: string
  desktop: SpoolRemoteDesktopSidebarContext
}

export type SpoolWorktreeSidebarRow = {
  type: 'spool-worktree'
  kind: SpoolWorktreeCatalogEntry['kind']
  key: string
  desktopRef: string
  connectionEpoch: number
  projectRef: string
  projectIdentityKey: string | null
  worktreeRef: string
  shareEpoch: string
  desktop: SpoolRemoteDesktopSidebarContext
  name: string
  branch: string | null
  expanded: boolean
  active: boolean
  sessionCount: number
  sessionCatalogStatus: SpoolWorktreeCatalogEntry['sessionCatalog']['status']
}

type SpoolSessionSidebarRowIdentity =
  | Pick<Extract<SpoolSessionCatalogEntry, { kind: 'terminal' }>, 'kind' | 'agent'>
  | Pick<Extract<SpoolSessionCatalogEntry, { kind: 'agent' }>, 'kind' | 'agent'>

export type SpoolSessionSidebarRow = {
  type: 'spool-session'
  key: string
  desktopRef: string
  connectionEpoch: number
  worktreeRef: string
  sessionRef: string
  title: string
  active: boolean
} & SpoolSessionSidebarRowIdentity

export type SpoolSidebarRow =
  | SpoolRemoteDesktopStatusSidebarRow
  | SpoolWorktreeSidebarRow
  | SpoolSessionSidebarRow

export type SpoolSidebarProjectionInput = {
  desktops: readonly SpoolRemoteDesktop[]
  expandedWorktreeRefsByDesktop: SpoolExpandedRefsByDesktop
  activeRoute: SpoolWorkspaceRoute | null
}

function createSpoolSidebarRowKey(type: SpoolSidebarRow['type'], ...refs: string[]): string {
  return `spool:${JSON.stringify([type, ...refs])}`
}

function isActiveWorktree(
  route: SpoolWorkspaceRoute | null,
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

export function projectSpoolSidebarRows(input: SpoolSidebarProjectionInput): SpoolSidebarRow[] {
  const rows: SpoolSidebarRow[] = []
  for (const desktop of input.desktops) {
    const catalog = desktop.catalog
    const sidebarDesktop: SpoolRemoteDesktopSidebarContext = {
      userDisplayName: desktop.userDisplayName,
      nodeDisplayName: desktop.nodeDisplayName,
      connectionStatus: desktop.connectionStatus,
      quota: catalog?.quota ?? []
    }
    if (!catalog) {
      // Why: flattening removes the Desktop hierarchy row, but connection
      // failures still need a visible, non-hierarchical status surface.
      rows.push({
        type: 'spool-desktop-status',
        key: createSpoolSidebarRowKey('spool-desktop-status', desktop.desktopRef),
        desktopRef: desktop.desktopRef,
        desktop: sidebarDesktop
      })
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
        const worktreeExpanded = isSpoolRefExpanded(
          input.expandedWorktreeRefsByDesktop,
          desktop.desktopRef,
          worktree.worktreeRef
        )
        rows.push({
          type: 'spool-worktree',
          kind: worktree.kind,
          key: createSpoolSidebarRowKey(
            'spool-worktree',
            desktop.desktopRef,
            project.projectRef,
            worktree.worktreeRef
          ),
          desktopRef: desktop.desktopRef,
          connectionEpoch: desktop.connectionEpoch,
          projectRef: project.projectRef,
          projectIdentityKey: isSpoolProjectIdentityKey(project.projectRef)
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
          const sessionIdentity: SpoolSessionSidebarRowIdentity = session
          rows.push({
            type: 'spool-session',
            key: createSpoolSidebarRowKey(
              'spool-session',
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
