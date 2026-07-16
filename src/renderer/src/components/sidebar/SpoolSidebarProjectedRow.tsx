import type React from 'react'
import { useAppStore } from '@/store'
import { SpoolWindowsFirewallNotice } from '@/components/spool/SpoolWindowsFirewallNotice'
import { SpoolAvailabilityNotice } from '@/components/spool/SpoolAvailabilityNotice'
import { SpoolSessionRow } from './SpoolSessionRow'
import { SpoolRemoteDesktopStatusRow } from './SpoolRemoteDesktopStatusRow'
import { SpoolRemoteWorktreesHeader } from './SpoolRemoteWorktreesHeader'
import { SpoolWorktreeRow } from './SpoolWorktreeRow'
import type { WorkspaceSidebarProjectedRow } from './workspace-sidebar-row-projection'

type SpoolProjectedRow = Exclude<WorkspaceSidebarProjectedRow, { kind: 'local' }>

export function SpoolSidebarProjectedRow({
  projected
}: {
  projected: SpoolProjectedRow
}): React.JSX.Element {
  const setWorktreeExpanded = useAppStore((state) => state.setSpoolWorktreeExpanded)
  const setRoute = useAppStore((state) => state.setActiveSpoolWorkspaceRoute)
  const setActiveView = useAppStore((state) => state.setActiveView)

  if (projected.kind === 'spool-windows-firewall') {
    return <SpoolWindowsFirewallNotice />
  }
  if (projected.kind === 'spool-availability') {
    return <SpoolAvailabilityNotice diagnostic={projected.diagnostic} />
  }
  if (projected.kind === 'spool-remote-worktrees-header') {
    return <SpoolRemoteWorktreesHeader />
  }

  const row = projected.row
  switch (row.type) {
    case 'spool-desktop-status':
      return <SpoolRemoteDesktopStatusRow row={row} />
    case 'spool-worktree':
      return (
        <SpoolWorktreeRow
          row={row}
          onToggle={() => setWorktreeExpanded(row.desktopRef, row.worktreeRef, !row.expanded)}
          onSelect={() => {
            setRoute({
              desktopRef: row.desktopRef,
              worktreeRef: row.worktreeRef,
              connectionEpoch: row.connectionEpoch
            })
            setActiveView('terminal')
          }}
        />
      )
    case 'spool-session':
      return (
        <SpoolSessionRow
          row={row}
          onSelect={() => {
            setRoute({
              desktopRef: row.desktopRef,
              worktreeRef: row.worktreeRef,
              sessionRef: row.sessionRef,
              connectionEpoch: row.connectionEpoch
            })
            setActiveView('terminal')
          }}
        />
      )
  }
}
