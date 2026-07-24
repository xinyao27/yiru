import type { PortForwardEntry } from '@yiru/runtime-protocol/ssh-connection'
import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'

export type PortForwardDialogState =
  | { mode: 'closed' }
  | {
      mode: 'add'
      defaults: { remotePort?: number; remoteHost?: string; label?: string; targetId?: string }
    }
  | { mode: 'edit'; entry: PortForwardEntry }

function safeLocalPort(remotePort: number): number {
  return remotePort < 1024 ? remotePort + 10000 : remotePort
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function PortForwardDialog({
  state,
  activeConnectionId,
  onClose
}: {
  state: PortForwardDialogState
  activeConnectionId: string | null
  onClose: () => void
}): React.JSX.Element {
  const isOpen = state.mode !== 'closed'
  const isEdit = state.mode === 'edit'
  const initialRemotePort =
    state.mode === 'edit'
      ? state.entry.remotePort.toString()
      : state.mode === 'add'
        ? (state.defaults.remotePort?.toString() ?? '')
        : ''
  const initialLocalPort =
    state.mode === 'edit'
      ? state.entry.localPort.toString()
      : state.mode === 'add' && state.defaults.remotePort != null
        ? safeLocalPort(state.defaults.remotePort).toString()
        : ''
  const initialRemoteHost =
    state.mode === 'edit'
      ? state.entry.remoteHost
      : state.mode === 'add'
        ? (state.defaults.remoteHost ?? 'localhost')
        : 'localhost'
  const initialLabel =
    state.mode === 'edit'
      ? (state.entry.label ?? '')
      : state.mode === 'add'
        ? (state.defaults.label ?? '')
        : ''
  // Why: capture the target at dialog-open time so a worktree switch cannot redirect it.
  const targetId =
    state.mode === 'edit'
      ? state.entry.connectionId
      : state.mode === 'add'
        ? (state.defaults.targetId ?? activeConnectionId ?? '')
        : (activeConnectionId ?? '')

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[340px]">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isEdit
              ? translate(
                  'auto.components.right.sidebar.PortsPanel.80206251c8',
                  'Edit Port Forward'
                )
              : translate('auto.components.right.sidebar.PortsPanel.907eb53ed2', 'Forward a Port')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isEdit
              ? translate(
                  'auto.components.right.sidebar.PortsPanel.10360598a4',
                  'Update the port forwarding configuration.'
                )
              : translate(
                  'auto.components.right.sidebar.PortsPanel.31e80cff2d',
                  'Forward a remote port to your local machine.'
                )}
          </DialogDescription>
        </DialogHeader>
        {isOpen && (
          <PortForwardForm
            key={
              state.mode === 'edit'
                ? `edit-${state.entry.id}`
                : `add-${targetId}-${initialRemotePort}-${initialRemoteHost}`
            }
            mode={state.mode}
            editId={state.mode === 'edit' ? state.entry.id : undefined}
            initialRemotePort={initialRemotePort}
            initialLocalPort={initialLocalPort}
            initialRemoteHost={initialRemoteHost}
            initialLabel={initialLabel}
            targetId={targetId}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PortForwardForm({
  mode,
  editId,
  initialRemotePort,
  initialLocalPort,
  initialRemoteHost,
  initialLabel,
  targetId,
  onClose
}: {
  mode: 'add' | 'edit'
  editId?: string
  initialRemotePort: string
  initialLocalPort: string
  initialRemoteHost: string
  initialLabel: string
  targetId: string
  onClose: () => void
}): React.JSX.Element {
  const [remotePort, setRemotePort] = useState(initialRemotePort)
  const [localPort, setLocalPort] = useState(initialLocalPort)
  const [remoteHost, setRemoteHost] = useState(initialRemoteHost)
  const [label, setLabel] = useState(initialLabel)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      setError(null)
      const parsedRemotePort = Number.parseInt(remotePort, 10)
      const parsedLocalPort = Number.parseInt(localPort || remotePort, 10)
      if (Number.isNaN(parsedRemotePort) || parsedRemotePort < 1 || parsedRemotePort > 65535) {
        setError('Remote port must be 1–65535')
        return
      }
      if (Number.isNaN(parsedLocalPort) || parsedLocalPort < 1 || parsedLocalPort > 65535) {
        setError('Local port must be 1–65535')
        return
      }
      setSubmitting(true)
      try {
        const portForward = {
          targetId,
          localPort: parsedLocalPort,
          remoteHost: remoteHost || 'localhost',
          remotePort: parsedRemotePort,
          label: label || undefined
        }
        await (mode === 'edit' && editId
          ? window.api.ssh.updatePortForward({ id: editId, ...portForward })
          : window.api.ssh.addPortForward(portForward))
        onClose()
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : String(submitError)
        if (message.includes('EADDRINUSE') || message.includes('already in use')) {
          setError(`Port ${parsedLocalPort} is already in use. Choose a different local port.`)
        } else if (message.includes('EACCES') || message.includes('permission denied')) {
          setError(`Port ${parsedLocalPort} requires elevated privileges. Use a local port ≥ 1024.`)
        } else {
          setError(message)
        }
      }
      setSubmitting(false)
    },
    [mode, editId, remotePort, localPort, remoteHost, label, targetId, onClose]
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <PortInput
          label={translate('auto.components.right.sidebar.PortsPanel.9e5a4118b0', 'Remote Port')}
          value={remotePort}
          onChange={(value) => {
            const nextRemotePort = digitsOnly(value)
            setRemotePort(nextRemotePort)
            const previous = Number.parseInt(remotePort, 10)
            const currentLocal = Number.parseInt(localPort, 10)
            if (
              !localPort ||
              currentLocal === previous ||
              currentLocal === safeLocalPort(previous)
            ) {
              const parsed = Number.parseInt(nextRemotePort, 10)
              setLocalPort(Number.isNaN(parsed) ? '' : safeLocalPort(parsed).toString())
            }
          }}
          placeholder="3000"
          autoFocus
          required
          numeric
        />
        <PortInput
          label={translate('auto.components.right.sidebar.PortsPanel.b950b1948b', 'Local Port')}
          value={localPort}
          onChange={(value) => setLocalPort(digitsOnly(value))}
          placeholder={translate(
            'auto.components.right.sidebar.PortsPanel.d57545ff92',
            'Same as remote'
          )}
          numeric
        />
        <PortInput
          label={translate('auto.components.right.sidebar.PortsPanel.a3721a50b0', 'Remote Host')}
          value={remoteHost}
          onChange={setRemoteHost}
          placeholder={translate(
            'auto.components.right.sidebar.PortsPanel.17bea6e391',
            'localhost'
          )}
        />
        <PortInput
          label={translate(
            'auto.components.right.sidebar.PortsPanel.8dfed0a15c',
            'Label (optional)'
          )}
          value={label}
          onChange={setLabel}
          placeholder={translate(
            'auto.components.right.sidebar.PortsPanel.4eb801ce93',
            'dev-server'
          )}
        />
      </div>
      {error && <div className="text-destructive text-[11px]">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {translate('auto.components.right.sidebar.PortsPanel.3ea4a02a8f', 'Cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={submitting || !remotePort}>
          {submitting
            ? mode === 'edit'
              ? translate('auto.components.right.sidebar.PortsPanel.d7c83cfd24', 'Saving...')
              : translate('auto.components.right.sidebar.PortsPanel.9f475dc994', 'Forwarding...')
            : mode === 'edit'
              ? translate('auto.components.right.sidebar.PortsPanel.9079776663', 'Save')
              : translate('auto.components.right.sidebar.PortsPanel.c9d106547a', 'Forward')}
        </Button>
      </div>
    </form>
  )
}

function PortInput({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  autoFocus,
  required
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  numeric?: boolean
  autoFocus?: boolean
  required?: boolean
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <Input
        type="text"
        size="xs"
        inputMode={numeric ? 'numeric' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-0.5"
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
      />
    </label>
  )
}
