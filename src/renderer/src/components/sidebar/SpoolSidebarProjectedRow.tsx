import type React from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { SpoolWindowsFirewallNotice } from '@/components/spool/SpoolWindowsFirewallNotice'
import { SpoolAvailabilityNotice } from '@/components/spool/SpoolAvailabilityNotice'
import { DesktopQuotaRows } from './DesktopQuotaRows'
import { SpoolDesktopRow } from './SpoolDesktopRow'
import { SpoolProjectRow } from './SpoolProjectRow'
import { SpoolSessionRow } from './SpoolSessionRow'
import { SpoolWorktreeRow } from './SpoolWorktreeRow'
import type { WorkspaceSidebarProjectedRow } from './workspace-sidebar-row-projection'

type SpoolProjectedRow = Exclude<WorkspaceSidebarProjectedRow, { kind: 'local' }>

export function SpoolSidebarProjectedRow({
  projected
}: {
  projected: SpoolProjectedRow
}): React.JSX.Element {
  const setDesktopExpanded = useAppStore((state) => state.setSpoolDesktopExpanded)
  const setProjectExpanded = useAppStore((state) => state.setSpoolProjectExpanded)
  const setWorktreeExpanded = useAppStore((state) => state.setSpoolWorktreeExpanded)
  const setRoute = useAppStore((state) => state.setActiveSpoolWorkspaceRoute)
  const setActiveView = useAppStore((state) => state.setActiveView)

  if (projected.kind === 'spool-section') {
    return (
      <div className="flex h-7 items-center px-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {translate('auto.components.sidebar.SpoolSidebarProjectedRow.heading', 'Spool')}
      </div>
    )
  }
  if (projected.kind === 'spool-windows-firewall') {
    return <SpoolWindowsFirewallNotice />
  }
  if (projected.kind === 'spool-availability') {
    return <SpoolAvailabilityNotice diagnostic={projected.diagnostic} />
  }

  const row = projected.row
  switch (row.type) {
    case 'spool-desktop':
      return (
        <SpoolDesktopRow
          row={row}
          onToggle={() => setDesktopExpanded(row.desktopRef, !row.expanded)}
        />
      )
    case 'spool-desktop-quota':
      return <DesktopQuotaRows row={row} />
    case 'spool-project':
      return (
        <SpoolProjectRow
          row={row}
          onToggle={() => setProjectExpanded(row.desktopRef, row.projectRef, !row.expanded)}
        />
      )
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
