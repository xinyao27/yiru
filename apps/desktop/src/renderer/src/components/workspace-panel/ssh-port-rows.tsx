import {
  Copy,
  Trash as Trash2,
  Pencil,
  ArrowSquareOut as ExternalLink
} from '@phosphor-icons/react'
import type { PortForwardEntry, EnrichedDetectedPort } from '@yiru/runtime-protocol/ssh-connection'
import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { getPortOpenBrowserTooltipLabel } from '@/lib/workspace-port-actions'
import {
  addressForPortForwardEntry,
  advertisedBrowserUrlForDetectedPort,
  advertisedBrowserUrlForForwardedRow
} from '@/lib/workspace-port-urls'

export function ForwardedPortRow({
  entry,
  onEdit,
  onOpenInBrowser
}: {
  entry: PortForwardEntry
  onEdit: () => void
  onOpenInBrowser: (event?: React.MouseEvent<HTMLButtonElement>) => void
}): React.JSX.Element {
  const [removing, setRemoving] = useState(false)
  const mountedRef = useMountedRef()
  const forwardedAddress = addressForPortForwardEntry(entry)
  const handleRemove = useCallback(async () => {
    setRemoving(true)
    try {
      await window.api.ssh.removePortForward({ id: entry.id })
    } catch {
      // The SSH broadcast remains the authority for the resulting row state.
    }
    if (mountedRef.current) {
      setRemoving(false)
    }
  }, [entry.id, mountedRef])
  const handleCopy = useCallback(
    () => void window.api.ui.writeClipboardText(forwardedAddress),
    [forwardedAddress]
  )
  const handleCopyButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      handleCopy()
      if (event.detail > 0) {
        event.currentTarget.blur()
      }
    },
    [handleCopy]
  )
  const handleOpenBrowserButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // Why: only pointer activations carry modifier intent for the system browser.
      onOpenInBrowser(event.detail > 0 ? event : undefined)
      if (event.detail > 0) {
        event.currentTarget.blur()
      }
    },
    [onOpenInBrowser]
  )
  const handleEditButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onEdit()
      if (event.detail > 0) {
        event.currentTarget.blur()
      }
    },
    [onEdit]
  )
  const handleRemoveButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      void handleRemove()
      if (event.detail > 0) {
        event.currentTarget.blur()
      }
    },
    [handleRemove]
  )
  const advertisedBrowserUrl = advertisedBrowserUrlForForwardedRow(entry)
  const openBrowserLabel = translate(
    'auto.components.right.sidebar.PortsPanel.b22b128b2a',
    'Open in Browser'
  )
  const openBrowserTitle = getPortOpenBrowserTooltipLabel(
    advertisedBrowserUrl
      ? translate(
          'auto.components.right.sidebar.PortsPanel.75aeea592f',
          'Open {{value0}} in Browser',
          { value0: advertisedBrowserUrl }
        )
      : openBrowserLabel
  )

  return (
    <div className="group hover:bg-accent/50 -mx-1 flex items-center gap-2 px-1 py-1 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {entry.label && (
            <span className="text-foreground truncate text-xs font-medium">{entry.label}</span>
          )}
          <span
            className={cn(
              'text-xs text-muted-foreground truncate',
              !entry.label && 'text-foreground'
            )}
          >
            :{entry.localPort} → :{entry.remotePort}
          </span>
        </div>
        {advertisedBrowserUrl && (
          <div className="text-muted-foreground/70 truncate text-[11px]">
            {translate('auto.components.right.sidebar.PortsPanel.de349d4560', 'opens {{value0}}', {
              value0: advertisedBrowserUrl
            })}
          </div>
        )}
      </div>
      <div className="can-hover:opacity-0 flex items-center gap-0.5 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <RowButton onClick={handleOpenBrowserButtonClick} title={openBrowserTitle}>
          <ExternalLink weight="regular" size={13} />
        </RowButton>
        <RowButton
          onClick={handleCopyButtonClick}
          title={translate(
            'auto.components.right.sidebar.PortsPanel.1004af16ab',
            'Copy {{value0}}',
            { value0: forwardedAddress }
          )}
        >
          <Copy size={13} />
        </RowButton>
        <RowButton
          onClick={handleEditButtonClick}
          title={translate('auto.components.right.sidebar.PortsPanel.b3548e59f4', 'Edit')}
        >
          <Pencil size={13} />
        </RowButton>
        <RowButton
          onClick={handleRemoveButtonClick}
          title={translate('auto.components.right.sidebar.PortsPanel.e740075063', 'Remove')}
          disabled={removing}
          className={cn(removing && 'opacity-50')}
        >
          <Trash2 size={13} />
        </RowButton>
      </div>
    </div>
  )
}

export function DetectedPortRow({
  port,
  onForward
}: {
  port: EnrichedDetectedPort & { targetId: string }
  onForward: () => void
}): React.JSX.Element {
  const advertisedBrowserUrl = advertisedBrowserUrlForDetectedPort(port)
  return (
    <div className="group hover:bg-accent/50 -mx-1 flex items-center gap-2 px-1 py-1 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-foreground text-xs">:{port.port}</span>
          {port.processName && (
            <span className="text-muted-foreground truncate text-xs">{port.processName}</span>
          )}
        </div>
        {advertisedBrowserUrl && (
          <div className="text-muted-foreground/70 truncate text-[11px]">
            {translate(
              'auto.components.right.sidebar.PortsPanel.c7e920aa7c',
              'advertised as {{value0}}',
              { value0: advertisedBrowserUrl }
            )}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="xs"
        type="button"
        className="can-hover:opacity-0 bg-accent hover:bg-accent/80 text-foreground focus-visible:bg-accent/80 h-auto border-0 py-0.5 text-[11px] transition-opacity group-hover:opacity-100"
        onClick={onForward}
      >
        {translate('auto.components.right.sidebar.PortsPanel.c9d106547a', 'Forward')}
      </Button>
    </div>
  )
}

function RowButton({
  onClick,
  title,
  disabled,
  className,
  children
}: {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  title: string
  disabled?: boolean
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Button
      variant="quiet"
      size="xs"
      type="button"
      className={cn('h-auto border-0 p-1', className)}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </Button>
  )
}
