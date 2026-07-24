import { Monitor } from '@phosphor-icons/react'
import type React from 'react'

import { translate } from '@/i18n/i18n'

import type { SpoolRemoteDesktopStatusSidebarRow } from './spool-sidebar-rows'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'

function getConnectionLabel(
  status: SpoolRemoteDesktopStatusSidebarRow['desktop']['connectionStatus']
): string {
  switch (status) {
    case 'connected':
      return ''
    case 'connecting':
      return translate('auto.components.sidebar.SpoolDesktopRow.connecting', 'Connecting…')
    case 'disconnected':
      return translate('auto.components.sidebar.SpoolDesktopRow.disconnected', 'Disconnected')
  }
}

export function SpoolRemoteDesktopStatusRow({
  row
}: {
  row: SpoolRemoteDesktopStatusSidebarRow
}): React.JSX.Element {
  const connectionLabel = getConnectionLabel(row.desktop.connectionStatus)
  return (
    <div
      role="status"
      className="border-border/60 bg-card text-muted-foreground mx-1 flex h-8 min-w-0 items-center gap-1.5 border px-2"
    >
      <Monitor aria-hidden="true" className="size-3.5 shrink-0" />
      <TruncatedSidebarLabel
        text={row.desktop.userDisplayName}
        className="min-w-0 flex-1 text-[12px] leading-none"
      />
      {connectionLabel ? (
        <span className="shrink-0 text-[10px] leading-none">{connectionLabel}</span>
      ) : null}
    </div>
  )
}
