import { HardDrives as Server, HardDrive as ServerOff } from '@phosphor-icons/react'
import type { SshConnectionStatus } from '@yiru/runtime-protocol/ssh-connection'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Button } from '~renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/components/ui/dialog'
import { useMountedRef } from '~renderer/hooks/use-mounted-ref'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'

import { statusColor } from '../settings/ssh/target-card'

type SshDisconnectedDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetId: string
  targetLabel: string
  status: SshConnectionStatus
}

const STATUS_MESSAGES: Partial<Record<SshConnectionStatus, string>> = {
  get disconnected() {
    return translate(
      'auto.components.sidebar.SshDisconnectedDialog.disconnected',
      'This SSH host is not connected.'
    )
  },
  get reconnecting() {
    return translate(
      'auto.components.sidebar.SshDisconnectedDialog.reconnecting',
      'Reconnecting to the remote host...'
    )
  },
  get 'reconnection-failed'() {
    return translate(
      'auto.components.sidebar.SshDisconnectedDialog.reconnectionFailed',
      'Reconnection to the remote host failed.'
    )
  },
  get error() {
    return translate(
      'auto.components.sidebar.SshDisconnectedDialog.376bed88e5',
      'The connection to the remote host encountered an error.'
    )
  },
  get 'auth-failed'() {
    return translate(
      'auto.components.sidebar.SshDisconnectedDialog.authFailed',
      'Authentication to the remote host failed.'
    )
  }
}

function isReconnectable(status: SshConnectionStatus): boolean {
  return ['disconnected', 'reconnection-failed', 'error', 'auth-failed'].includes(status)
}

export function SshDisconnectedDialog({
  open,
  onOpenChange,
  targetId,
  targetLabel,
  status
}: SshDisconnectedDialogProps): React.JSX.Element {
  const [connecting, setConnecting] = useState(false)
  const mountedRef = useMountedRef()

  const handleReconnect = useCallback(async () => {
    setConnecting(true)
    try {
      await window.api.ssh.connect({ targetId })
      if (mountedRef.current) {
        onOpenChange(false)
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : translate(
              'auto.components.sidebar.SshDisconnectedDialog.656368f3a2',
              'Reconnection failed'
            )
      )
    } finally {
      if (mountedRef.current) {
        setConnecting(false)
      }
    }
  }, [mountedRef, targetId, onOpenChange])

  const isConnecting =
    connecting ||
    status === 'connecting' ||
    status === 'deploying-relay' ||
    status === 'reconnecting'
  const reconnectingMessage =
    STATUS_MESSAGES.reconnecting ??
    translate(
      'auto.components.sidebar.SshDisconnectedDialog.reconnecting',
      'Reconnecting to the remote host...'
    )
  const disconnectedMessage =
    STATUS_MESSAGES.disconnected ??
    translate(
      'auto.components.sidebar.SshDisconnectedDialog.disconnected',
      'This SSH host is not connected.'
    )
  const message = isConnecting
    ? reconnectingMessage
    : (STATUS_MESSAGES[status] ?? disconnectedMessage)
  const showReconnect = isReconnectable(status)

  useEffect(() => {
    // Window-level Enter handler. The dialog typically appears while focus
    // is inside an embedded terminal (xterm) or code surface that
    // aggressively reclaims focus, so dialog-scoped key handlers never
    // fire. Listening on window (capture phase) catches Enter regardless
    // of where focus actually lives while the dialog is open.
    if (!open || !showReconnect || isConnecting) {
      return undefined
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.defaultPrevented) {
        return
      }
      if (event.isComposing) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      void handleReconnect()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, showReconnect, isConnecting, handleReconnect])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 p-5 sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="gap-1">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            {isConnecting ? (
              <LoadingIndicator className="size-4 text-yellow-500" />
            ) : (
              <ServerOff className="text-muted-foreground size-4" />
            )}
            {isConnecting
              ? translate(
                  'auto.components.sidebar.SshDisconnectedDialog.cb5938ae79',
                  'Reconnecting...'
                )
              : translate(
                  'auto.components.sidebar.SshDisconnectedDialog.11552bf786',
                  'SSH Disconnected'
                )}
          </DialogTitle>
          <DialogDescription className="text-xs">{message}</DialogDescription>
        </DialogHeader>

        <div className="border-border/50 bg-card/40 flex items-center gap-2.5 border px-3 py-2">
          <Server className="text-muted-foreground size-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium">{targetLabel}</span>
          </div>
          {isConnecting ? (
            <LoadingIndicator className="size-3.5 shrink-0 text-yellow-500" />
          ) : (
            <span className={cn('size-1.5 shrink-0', statusColor(status))} />
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isConnecting}
          >
            {translate('auto.components.sidebar.SshDisconnectedDialog.89385db176', 'Dismiss')}
          </Button>
          {showReconnect && (
            <Button size="sm" onClick={() => void handleReconnect()} disabled={isConnecting}>
              {isConnecting ? (
                <>
                  <LoadingIndicator className="size-3.5" />
                  {translate(
                    'auto.components.sidebar.SshDisconnectedDialog.ca4a7892af',
                    'Connecting...'
                  )}
                </>
              ) : (
                translate('auto.components.sidebar.SshDisconnectedDialog.4afcca1d24', 'Reconnect')
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
