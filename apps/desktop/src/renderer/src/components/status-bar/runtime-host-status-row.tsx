import { useCallback, useState } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

export type RuntimeHostConnectionState = 'connected' | 'checking' | 'reconnecting' | 'disconnected'

function runtimeStatusLabel(state: RuntimeHostConnectionState): string {
  switch (state) {
    case 'connected':
      return translate('auto.components.status.bar.SshStatusSegment.runtime_online', 'Connected')
    case 'checking':
      return translate('auto.components.status.bar.SshStatusSegment.runtime_checking', 'Checking')
    case 'reconnecting':
      return translate(
        'auto.components.status.bar.SshStatusSegment.runtime_reconnecting',
        'Reconnecting'
      )
    case 'disconnected':
      return translate(
        'auto.components.status.bar.SshStatusSegment.runtime_unavailable',
        'Disconnected'
      )
  }
}

function runtimeDotColor(state: RuntimeHostConnectionState): string {
  switch (state) {
    case 'connected':
      return 'bg-emerald-500'
    case 'checking':
    case 'reconnecting':
      return 'bg-yellow-500'
    case 'disconnected':
      return 'bg-muted-foreground/40'
  }
}

function runtimeStatusTone(state: RuntimeHostConnectionState): string {
  if (state === 'checking' || state === 'reconnecting') {
    return 'text-yellow-500'
  }
  return 'text-muted-foreground'
}

function runtimeActionLabel(state: RuntimeHostConnectionState): string | null {
  switch (state) {
    case 'connected':
      return translate('auto.components.status.bar.SshStatusSegment.59b553e2aa', 'Disconnect')
    case 'disconnected':
      return translate('auto.components.status.bar.SshStatusSegment.63f36455cc', 'Connect')
    case 'checking':
    case 'reconnecting':
      return null
  }
}

export function RuntimeHostStatusRow({
  label,
  state,
  detail,
  onConnect,
  onDisconnect
}: {
  label: string
  state: RuntimeHostConnectionState
  detail?: string
  onConnect?: () => Promise<void>
  onDisconnect?: () => Promise<void>
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const mountedRef = useMountedRef()
  const actionLabel = runtimeActionLabel(state)

  const handleAction = useCallback(async () => {
    const action = state === 'connected' ? onDisconnect : onConnect
    if (!action) {
      return
    }
    setBusy(true)
    try {
      await action()
    } finally {
      if (mountedRef.current) {
        setBusy(false)
      }
    }
  }, [mountedRef, onConnect, onDisconnect, state])

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <span className={cn('size-1.5 shrink-0 rounded-full', runtimeDotColor(state))} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium">{label}</div>
        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[10px]">
          <span>
            {translate(
              'auto.components.status.bar.SshStatusSegment.remote_server',
              'Remote Server'
            )}
          </span>
          <span aria-hidden="true">·</span>
          <span className={cn('inline-flex min-w-0 items-center gap-1', runtimeStatusTone(state))}>
            {state === 'checking' || state === 'reconnecting' ? (
              <LoadingIndicator className="size-2.5 shrink-0" />
            ) : null}
            <span className="truncate">{runtimeStatusLabel(state)}</span>
          </span>
          {detail ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{detail}</span>
            </>
          ) : null}
        </div>
      </div>
      {busy ? (
        <LoadingIndicator className="text-muted-foreground size-3 shrink-0" />
      ) : actionLabel && (state === 'connected' ? onDisconnect : onConnect) ? (
        <button
          type="button"
          onClick={() => void handleAction()}
          className="text-muted-foreground hover:bg-accent/70 hover:text-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
