import type React from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Monitor, Plus } from '~renderer/components/icons/hugeicons'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'
import { coworkingSharingClient } from '~renderer/runtime/coworking-sharing-client'
import { runtimeEnvironmentsClient } from '~renderer/runtime/runtime-environments-client'
import { useAppStore } from '~renderer/store'
import type { CoworkingRemoteDesktop } from '~shared/coworking/catalog-contract'

function getConnectionLabel(status: CoworkingRemoteDesktop['connectionStatus']): string {
  switch (status) {
    case 'connected':
      return ''
    case 'connecting':
      return translate('auto.components.status.bar.CoworkingRemoteHosts.connecting', 'Connecting…')
    case 'disconnected':
      return translate(
        'auto.components.status.bar.CoworkingRemoteHosts.disconnected',
        'Disconnected'
      )
  }
}

function getHostAccessErrorMessage(
  error: unknown,
  translateMessage: (key: string, fallback: string) => string
): string {
  if (
    error instanceof Error &&
    (error.message === 'disconnected' || error.message.endsWith(': disconnected'))
  ) {
    return translateMessage(
      'auto.components.status.bar.CoworkingRemoteHosts.hostAccessFailed',
      'Could not request remote host access.'
    )
  }

  return error instanceof Error
    ? error.message
    : translateMessage(
        'auto.components.status.bar.CoworkingRemoteHosts.hostAccessFailed',
        'Could not request remote host access.'
      )
}

export function CoworkingRemoteHosts({
  desktops
}: {
  desktops: readonly CoworkingRemoteDesktop[]
}): React.JSX.Element | null {
  if (desktops.length === 0) {
    return null
  }
  return (
    <div className="border-border flex flex-col gap-2 border-t pt-3">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Monitor aria-hidden="true" className="size-3.5 shrink-0" />
        <span>
          {translate('auto.components.status.bar.CoworkingRemoteHosts.title', 'Remote hosts')}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {desktops.map((desktop) => (
          <CoworkingRemoteHostRow key={desktop.desktopRef} desktop={desktop} />
        ))}
      </div>
    </div>
  )
}

function CoworkingRemoteHostRow({
  desktop
}: {
  desktop: CoworkingRemoteDesktop
}): React.JSX.Element {
  const connectionLabel = getConnectionLabel(desktop.connectionStatus)
  const [isRequesting, setIsRequesting] = useState(false)
  const setRuntimeEnvironments = useAppStore((state) => state.setRuntimeEnvironments)
  const refreshRuntimeEnvironmentStatus = useAppStore(
    (state) => state.refreshRuntimeEnvironmentStatus
  )

  const requestHostAccess = async (): Promise<void> => {
    setIsRequesting(true)
    try {
      const result = await coworkingSharingClient.requestHostAccess({
        desktopRef: desktop.desktopRef
      })
      if (result.status !== 'granted') {
        toast.info(
          result.status === 'denied'
            ? translate(
                'auto.components.status.bar.CoworkingRemoteHosts.hostAccessDenied',
                'Remote host access was denied.'
              )
            : translate(
                'auto.components.status.bar.CoworkingRemoteHosts.hostAccessCancelled',
                'Remote host access request was cancelled.'
              )
        )
        return
      }
      setRuntimeEnvironments(await runtimeEnvironmentsClient.list())
      await refreshRuntimeEnvironmentStatus(result.environmentId)
      toast.success(
        translate(
          'auto.components.status.bar.CoworkingRemoteHosts.hostAdded',
          '{{value0}} is ready as a remote host.',
          { value0: desktop.nodeDisplayName }
        )
      )
    } catch (error) {
      toast.error(getHostAccessErrorMessage(error, translate))
    } finally {
      setIsRequesting(false)
    }
  }

  return (
    <div className="border-border flex min-w-0 items-center gap-2 border px-2 py-1.5">
      <Monitor aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{desktop.userDisplayName}</div>
        <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-[10px]">
          <span className="min-w-0 truncate">{desktop.nodeDisplayName}</span>
          {connectionLabel ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{connectionLabel}</span>
            </>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={desktop.connectionStatus !== 'connected' || isRequesting}
        onClick={() => void requestHostAccess()}
      >
        <Plus aria-hidden="true" />
        {isRequesting
          ? translate('auto.components.status.bar.CoworkingRemoteHosts.requesting', 'Waiting…')
          : translate('auto.components.status.bar.CoworkingRemoteHosts.useAsHost', 'Use as host')}
      </Button>
    </div>
  )
}
