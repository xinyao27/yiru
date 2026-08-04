import { Monitor, Plus } from '@phosphor-icons/react'
import type React from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'

import type { CoworkingRemoteDesktopStatusSidebarRow } from './coworking-sidebar-rows'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'

function getConnectionLabel(
  status: CoworkingRemoteDesktopStatusSidebarRow['desktop']['connectionStatus']
): string {
  switch (status) {
    case 'connected':
      return ''
    case 'connecting':
      return translate('auto.components.sidebar.CoworkingDesktopRow.connecting', 'Connecting…')
    case 'disconnected':
      return translate('auto.components.sidebar.CoworkingDesktopRow.disconnected', 'Disconnected')
  }
}

export function CoworkingRemoteDesktopStatusRow({
  row
}: {
  row: CoworkingRemoteDesktopStatusSidebarRow
}): React.JSX.Element {
  const connectionLabel = getConnectionLabel(row.desktop.connectionStatus)
  const [isRequesting, setIsRequesting] = useState(false)
  const setRuntimeEnvironments = useAppStore((state) => state.setRuntimeEnvironments)
  const refreshRuntimeEnvironmentStatus = useAppStore(
    (state) => state.refreshRuntimeEnvironmentStatus
  )

  const requestHostAccess = async (): Promise<void> => {
    setIsRequesting(true)
    try {
      const result = await window.api.coworkingSharing.requestHostAccess({
        desktopRef: row.desktopRef
      })
      if (result.status !== 'granted') {
        toast.info(
          result.status === 'denied'
            ? translate(
                'auto.components.sidebar.CoworkingDesktopRow.hostAccessDenied',
                'Remote host access was denied.'
              )
            : translate(
                'auto.components.sidebar.CoworkingDesktopRow.hostAccessCancelled',
                'Remote host access request was cancelled.'
              )
        )
        return
      }
      setRuntimeEnvironments(await window.api.runtimeEnvironments.list())
      await refreshRuntimeEnvironmentStatus(result.environment.id)
      toast.success(
        translate(
          'auto.components.sidebar.CoworkingDesktopRow.hostAdded',
          '{{value0}} is ready as a remote host.',
          { value0: row.desktop.nodeDisplayName }
        )
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.sidebar.CoworkingDesktopRow.hostAccessFailed',
              'Could not request remote host access.'
            )
      )
    } finally {
      setIsRequesting(false)
    }
  }

  return (
    <div className="border-border/60 bg-card text-muted-foreground mx-1 flex h-8 min-w-0 items-center gap-1.5 border px-2">
      <Monitor aria-hidden="true" className="size-3.5 shrink-0" />
      <TruncatedSidebarLabel
        text={row.desktop.userDisplayName}
        className="min-w-0 flex-1 text-[12px] leading-none"
      />
      {connectionLabel ? (
        <span className="shrink-0 text-[10px] leading-none">{connectionLabel}</span>
      ) : null}
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={row.desktop.connectionStatus !== 'connected' || isRequesting}
        onClick={() => void requestHostAccess()}
      >
        <Plus aria-hidden="true" />
        {isRequesting
          ? translate(
              'auto.components.sidebar.CoworkingDesktopRow.requestingHostAccess',
              'Waiting…'
            )
          : translate('auto.components.sidebar.CoworkingDesktopRow.useAsHost', 'Use as host')}
      </Button>
    </div>
  )
}
