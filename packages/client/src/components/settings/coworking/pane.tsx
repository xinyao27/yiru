import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowClockwise as RefreshCw, Trash as Trash2 } from '~renderer/components/icons/hugeicons'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Button } from '~renderer/components/ui/button'
import { useMountedRef } from '~renderer/hooks/use-mounted-ref'
import { translate } from '~renderer/i18n/i18n'
import { coworkingSharingClient } from '~renderer/runtime/coworking-sharing-client'
import type { CoworkingHostDeviceView } from '~shared/coworking/host-access-contract'

export function CoworkingSettingsPane(): React.JSX.Element {
  const [devices, setDevices] = useState<readonly CoworkingHostDeviceView[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null)
  const mountedRef = useMountedRef()

  const loadDevices = useCallback(async (): Promise<void> => {
    if (mountedRef.current) {
      setIsLoading(true)
    }
    try {
      const result = await coworkingSharingClient.listHostDevices()
      if (mountedRef.current) {
        setDevices(result.devices)
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.CoworkingSettingsPane.loadFailed',
                'Could not load authorized remote host clients.'
              )
        )
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  const revoke = async (deviceId: string): Promise<void> => {
    setRevokingDeviceId(deviceId)
    try {
      const result = await coworkingSharingClient.revokeHostDevice({ deviceId })
      if (!result.revoked) {
        toast.info(
          translate(
            'auto.components.settings.CoworkingSettingsPane.alreadyRevoked',
            'This authorization was already revoked.'
          )
        )
      } else {
        toast.success(
          translate(
            'auto.components.settings.CoworkingSettingsPane.revoked',
            'Authorization revoked and active connections disconnected.'
          )
        )
      }
      await loadDevices()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.settings.CoworkingSettingsPane.revokeFailed',
              'Could not revoke this authorization.'
            )
      )
    } finally {
      if (mountedRef.current) {
        setRevokingDeviceId(null)
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">
            {translate(
              'auto.components.settings.CoworkingSettingsPane.title',
              'Authorized remote host clients'
            )}
          </h3>
          <p className="text-muted-foreground text-xs leading-5">
            {translate(
              'auto.components.settings.CoworkingSettingsPane.description',
              'Like authorized_keys, these devices retain access until revoked or expired.'
            )}
          </p>
        </div>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={isLoading}
          onClick={() => void loadDevices()}
        >
          <RefreshCw aria-hidden="true" />
          {translate('auto.components.settings.CoworkingSettingsPane.refresh', 'Refresh')}
        </Button>
      </div>

      {isLoading && devices.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-2 py-4 text-xs">
          <LoadingIndicator size="sm" />
          {translate('auto.components.settings.CoworkingSettingsPane.loading', 'Loading…')}
        </div>
      ) : devices.length === 0 ? (
        <p className="border-border text-muted-foreground border p-3 text-xs">
          {translate(
            'auto.components.settings.CoworkingSettingsPane.empty',
            'No remote host clients have been authorized through Coworking.'
          )}
        </p>
      ) : (
        <div className="divide-border border-border divide-y border">
          {devices.map((device) => (
            <CoworkingHostDeviceRow
              key={device.deviceId}
              device={device}
              isRevoking={revokingDeviceId === device.deviceId}
              onRevoke={() => void revoke(device.deviceId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CoworkingHostDeviceRow({
  device,
  isRevoking,
  onRevoke
}: {
  device: CoworkingHostDeviceView
  isRevoking: boolean
  onRevoke: () => void
}): React.JSX.Element {
  const isExpired = device.expiresAt !== null && device.expiresAt <= Date.now()
  const active = device.revokedAt === null && !isExpired
  const accessLabel =
    device.tier === 'host'
      ? translate('auto.components.settings.CoworkingSettingsPane.fullAccess', 'Full access')
      : translate('auto.components.settings.CoworkingSettingsPane.readOnly', 'Read only')
  return (
    <div className="flex items-start gap-3 p-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{device.name}</span>
          <span className="text-muted-foreground text-xs">{accessLabel}</span>
          {!active ? (
            <span className="text-destructive text-xs">
              {device.revokedAt !== null
                ? translate(
                    'auto.components.settings.CoworkingSettingsPane.revokedState',
                    'Revoked'
                  )
                : translate(
                    'auto.components.settings.CoworkingSettingsPane.expiredState',
                    'Expired'
                  )}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.CoworkingSettingsPane.identity',
            '{{value0}} · node {{value1}}',
            { value0: device.subject.userDisplayName, value1: device.subject.nodeId }
          )}
        </p>
        <p className="text-muted-foreground text-[11px]">
          {translate(
            'auto.components.settings.CoworkingSettingsPane.dates',
            'Paired {{value0}} · Last used {{value1}} · Expires {{value2}}',
            {
              value0: formatDate(device.pairedAt),
              value1: device.lastSeenAt
                ? formatDate(device.lastSeenAt)
                : translate('auto.components.settings.CoworkingSettingsPane.never', 'Never'),
              value2: device.expiresAt
                ? formatDate(device.expiresAt)
                : translate('auto.components.settings.CoworkingSettingsPane.noExpiry', 'Never')
            }
          )}
        </p>
      </div>
      {active ? (
        <Button type="button" size="xs" variant="outline" disabled={isRevoking} onClick={onRevoke}>
          <Trash2 aria-hidden="true" />
          {isRevoking
            ? translate('auto.components.settings.CoworkingSettingsPane.revoking', 'Revoking…')
            : translate('auto.components.settings.CoworkingSettingsPane.revoke', 'Revoke')}
        </Button>
      ) : null}
    </div>
  )
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(timestamp)
}
