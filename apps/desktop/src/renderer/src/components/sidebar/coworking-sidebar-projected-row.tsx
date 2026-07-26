import type React from 'react'

import { CoworkingWindowsFirewallNotice } from '@/components/coworking/windows-firewall-notice'
import { useAppStore } from '@/store'

import { CoworkingRemoteDesktopStatusRow } from './coworking-remote-desktop-status-row'
import { CoworkingRemoteWorktreesHeader } from './coworking-remote-worktrees-header'
import { CoworkingSessionRow } from './coworking-session-row'
import { CoworkingWorktreeRow } from './coworking-worktree-row'
import type { WorkspaceSidebarProjectedRow } from './workspace-sidebar-row-projection'

type CoworkingProjectedRow = Exclude<WorkspaceSidebarProjectedRow, { kind: 'local' }>

export function CoworkingSidebarProjectedRow({
  projected,
  onToggleRemoteWorktrees
}: {
  projected: CoworkingProjectedRow
  onToggleRemoteWorktrees: () => void
}): React.JSX.Element {
  const setWorktreeExpanded = useAppStore((state) => state.setCoworkingWorktreeExpanded)
  const setRoute = useAppStore((state) => state.setActiveCoworkingWorkspaceRoute)
  const setActiveView = useAppStore((state) => state.setActiveView)

  if (projected.kind === 'coworking-windows-firewall') {
    return <CoworkingWindowsFirewallNotice />
  }
  if (projected.kind === 'coworking-remote-worktrees-header') {
    return (
      <CoworkingRemoteWorktreesHeader
        expanded={!projected.collapsed}
        onToggle={onToggleRemoteWorktrees}
      />
    )
  }

  const row = projected.row
  switch (row.type) {
    case 'coworking-desktop-status':
      return <CoworkingRemoteDesktopStatusRow row={row} />
    case 'coworking-worktree':
      return (
        <CoworkingWorktreeRow
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
    case 'coworking-session':
      return (
        <CoworkingSessionRow
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
