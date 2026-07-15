import type {
  SpoolProviderQuota,
  SpoolRemoteDesktop,
  SpoolWorktreeCatalogEntry
} from '../../../../shared/spool/spool-catalog-contract'
import type {
  SpoolExpandedRefsByDesktop,
  SpoolWorkspaceRoute
} from '../../store/slices/spool-sharing-types'
import { isSpoolRefExpanded } from '../../store/slices/spool-sharing-selectors'

export type SpoolDesktopSidebarRow = {
  type: 'spool-desktop'
  key: string
  desktopRef: string
  connectionEpoch: number
  userDisplayName: string
  nodeDisplayName: string
  connectionStatus: SpoolRemoteDesktop['connectionStatus']
  expanded: boolean
  projectCount: number
  quota: readonly SpoolProviderQuota[]
}

export type SpoolProjectSidebarRow = {
  type: 'spool-project'
  key: string
  desktopRef: string
  projectRef: string
  name: string
  expanded: boolean
  worktreeCount: number
}

export type SpoolWorktreeSidebarRow = {
  type: 'spool-worktree'
  key: string
  desktopRef: string
  connectionEpoch: number
  projectRef: string
  worktreeRef: string
  shareEpoch: string
  name: string
  branch: string | null
  expanded: boolean
  active: boolean
  sessionCount: number
  sessionCatalogStatus: SpoolWorktreeCatalogEntry['sessionCatalog']['status']
}

export type SpoolSessionSidebarRow = {
  type: 'spool-session'
  key: string
  desktopRef: string
  connectionEpoch: number
  worktreeRef: string
  sessionRef: string
  provider: 'claude' | 'codex' | 'other'
  title: string
  active: boolean
}

export type SpoolSidebarRow =
  | SpoolDesktopSidebarRow
  | SpoolProjectSidebarRow
  | SpoolWorktreeSidebarRow
  | SpoolSessionSidebarRow

export type SpoolSidebarProjectionInput = {
  desktops: readonly SpoolRemoteDesktop[]
  expandedDesktopRefs: ReadonlySet<string>
  expandedProjectRefsByDesktop: SpoolExpandedRefsByDesktop
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
    const expanded = input.expandedDesktopRefs.has(desktop.desktopRef)
    rows.push({
      type: 'spool-desktop',
      key: createSpoolSidebarRowKey('spool-desktop', desktop.desktopRef),
      desktopRef: desktop.desktopRef,
      connectionEpoch: desktop.connectionEpoch,
      userDisplayName: desktop.userDisplayName,
      nodeDisplayName: desktop.nodeDisplayName,
      connectionStatus: desktop.connectionStatus,
      expanded,
      projectCount: catalog?.projects.length ?? 0,
      quota: catalog?.quota ?? []
    })
    if (!expanded || !catalog) {
      continue
    }
    for (const project of catalog.projects) {
      const projectExpanded = isSpoolRefExpanded(
        input.expandedProjectRefsByDesktop,
        desktop.desktopRef,
        project.projectRef
      )
      rows.push({
        type: 'spool-project',
        key: createSpoolSidebarRowKey('spool-project', desktop.desktopRef, project.projectRef),
        desktopRef: desktop.desktopRef,
        projectRef: project.projectRef,
        name: project.name,
        expanded: projectExpanded,
        worktreeCount: project.worktrees.length
      })
      if (!projectExpanded) {
        continue
      }
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
          key: createSpoolSidebarRowKey(
            'spool-worktree',
            desktop.desktopRef,
            project.projectRef,
            worktree.worktreeRef
          ),
          desktopRef: desktop.desktopRef,
          connectionEpoch: desktop.connectionEpoch,
          projectRef: project.projectRef,
          worktreeRef: worktree.worktreeRef,
          shareEpoch: worktree.shareEpoch,
          name: worktree.name,
          branch: worktree.branch,
          expanded: worktreeExpanded,
          active: worktreeActive && !input.activeRoute?.sessionRef,
          sessionCount: worktree.sessions.length,
          sessionCatalogStatus: worktree.sessionCatalog.status
        })
        if (!worktreeExpanded) {
          continue
        }
        for (const session of worktree.sessions) {
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
            provider: session.provider,
            title: session.title,
            active: worktreeActive && input.activeRoute?.sessionRef === session.sessionRef
          })
        }
      }
    }
  }
  return rows
}
