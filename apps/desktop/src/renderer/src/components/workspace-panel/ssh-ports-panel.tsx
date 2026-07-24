import { CaretRight as ChevronRight, Plugs as Unplug, Plus } from '@phosphor-icons/react'
import type { EnrichedDetectedPort, PortForwardEntry } from '@yiru/runtime-protocol/ssh-connection'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { resolvePortOpenInYiruBrowser } from '@/lib/workspace-port-actions'
import { browserUrlForPortForwardEntry } from '@/lib/workspace-port-urls'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'

import { PortForwardDialog, type PortForwardDialogState } from './port-forward-dialog'
import { DetectedPortRow, ForwardedPortRow } from './ssh-port-rows'

// Why: SSH discovery and forwarding can spell loopback hosts differently.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '::'])

function normalizeHost(host: string | undefined): string {
  return !host || LOOPBACK_HOSTS.has(host) ? 'localhost' : host
}

export function SshPortsPanel(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const portForwardsByConnection = useAppStore((state) => state.portForwardsByConnection)
  const detectedPortsByConnection = useAppStore((state) => state.detectedPortsByConnection)
  const sshConnectionStates = useAppStore((state) => state.sshConnectionStates)
  const createBrowserTab = useAppStore((state) => state.createBrowserTab)
  // Why: actions and connection state must follow the active worktree's host.
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const activeConnectionId = activeRepo?.connectionId ?? null

  const isDisconnected = activeConnectionId
    ? sshConnectionStates.get(activeConnectionId)?.status !== 'connected'
    : true
  const allForwards = useMemo(
    () => (activeConnectionId ? (portForwardsByConnection[activeConnectionId] ?? []) : []),
    [activeConnectionId, portForwardsByConnection]
  )
  const forwardedKeys = useMemo(
    () =>
      new Set(allForwards.map((entry) => `${normalizeHost(entry.remoteHost)}:${entry.remotePort}`)),
    [allForwards]
  )
  const allDetected = useMemo(() => {
    if (!activeConnectionId) {
      return []
    }
    const ports = detectedPortsByConnection[activeConnectionId] ?? []
    return ports
      .filter((port) => !forwardedKeys.has(`${normalizeHost(port.host)}:${port.port}`))
      .map((port) => ({ ...port, targetId: activeConnectionId }))
      .sort((first, second) => first.port - second.port)
  }, [activeConnectionId, detectedPortsByConnection, forwardedKeys])

  const [forwardedCollapsed, setForwardedCollapsed] = useState(false)
  const [detectedCollapsed, setDetectedCollapsed] = useState(false)
  const [dialogState, setDialogState] = useState<PortForwardDialogState>({ mode: 'closed' })
  const handleForwardDetected = useCallback((port: EnrichedDetectedPort & { targetId: string }) => {
    setDialogState({
      mode: 'add',
      defaults: {
        remotePort: port.port,
        remoteHost: normalizeHost(port.host),
        label: port.processName,
        targetId: port.targetId
      }
    })
  }, [])
  const handleOpenForwardInBrowser = useCallback(
    (entry: PortForwardEntry, event?: React.MouseEvent<HTMLButtonElement>) => {
      const url = browserUrlForPortForwardEntry(entry)
      if (
        !resolvePortOpenInYiruBrowser({
          settings,
          event,
          isMac: navigator.userAgent.includes('Mac')
        })
      ) {
        void window.api.shell.openUrl(url)
        return
      }
      if (!activeWorktree?.id) {
        toast.error(
          translate(
            'auto.components.right.sidebar.PortsPanel.409afcc145',
            'No workspace selected for the browser.'
          )
        )
        return
      }
      createBrowserTab(activeWorktree.id, url, { activate: true })
    },
    [activeWorktree?.id, createBrowserTab, settings]
  )
  const openAddDialog = useCallback(() => {
    setDialogState({ mode: 'add', defaults: { targetId: activeConnectionId ?? undefined } })
  }, [activeConnectionId])

  if (isDisconnected) {
    return <DisconnectedPortsState />
  }

  return (
    <div className="scrollbar-sleek flex h-full flex-col overflow-y-auto">
      <PortsHeader onAdd={openAddDialog} />
      {allForwards.length > 0 && (
        <PortSection
          label={translate('auto.components.right.sidebar.PortsPanel.ddbe58d74e', 'Forwarded')}
          count={allForwards.length}
          collapsed={forwardedCollapsed}
          onToggle={() => setForwardedCollapsed((value) => !value)}
        >
          {allForwards.map((entry) => (
            <ForwardedPortRow
              key={entry.id}
              entry={entry}
              onEdit={() => setDialogState({ mode: 'edit', entry })}
              onOpenInBrowser={(event) => handleOpenForwardInBrowser(entry, event)}
            />
          ))}
        </PortSection>
      )}
      {allDetected.length > 0 && (
        <PortSection
          label={translate('auto.components.right.sidebar.PortsPanel.36b1b2984a', 'Detected')}
          count={allDetected.length}
          collapsed={detectedCollapsed}
          onToggle={() => setDetectedCollapsed((value) => !value)}
        >
          {allDetected.map((port) => (
            <DetectedPortRow
              key={`${port.targetId}-${port.host}-${port.port}`}
              port={port}
              onForward={() => handleForwardDetected(port)}
            />
          ))}
        </PortSection>
      )}
      {allForwards.length === 0 && allDetected.length === 0 && (
        <EmptyPortsState onAdd={openAddDialog} />
      )}
      <PortForwardDialog
        state={dialogState}
        activeConnectionId={activeConnectionId}
        onClose={() => setDialogState({ mode: 'closed' })}
      />
    </div>
  )
}

function PortsHeader({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="border-border flex items-center justify-between border-b px-3 py-2">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {translate('auto.components.right.sidebar.PortsPanel.6bc058dbe1', 'Ports')}
      </span>
      <Button
        variant="quiet"
        size="xs"
        type="button"
        className="flex h-auto border-0 p-0"
        onClick={onAdd}
      >
        <Plus size={14} />
        {translate('auto.components.right.sidebar.PortsPanel.a103dae837', 'Add')}
      </Button>
    </div>
  )
}

function PortSection({
  label,
  count,
  collapsed,
  onToggle,
  children
}: {
  label: string
  count: number
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="px-3 pt-2">
      <Button
        variant="ghost"
        size="xs"
        type="button"
        className="focus-visible:bg-accent mb-1 flex h-auto w-full justify-start border-0 p-0 text-left font-normal whitespace-normal"
        onClick={onToggle}
      >
        <ChevronRight
          weight="regular"
          size={12}
          className={cn('text-muted-foreground transition-transform', !collapsed && 'rotate-90')}
        />
        <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          {label}
        </span>
        <span className="text-muted-foreground/60 ml-1 text-[10px]">{count}</span>
      </Button>
      {!collapsed && children}
    </div>
  )
}

function DisconnectedPortsState(): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center px-4 text-center">
      <Unplug size={32} className="mb-3 opacity-50" />
      <p className="text-sm font-medium">
        {translate('auto.components.right.sidebar.PortsPanel.a2f1a47f42', 'SSH connection lost')}
      </p>
      <p className="mt-1 text-xs">
        {translate('auto.components.right.sidebar.PortsPanel.d4c3cd679c', 'Reconnecting...')}
      </p>
    </div>
  )
}

function EmptyPortsState({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center px-4 text-center">
      <p className="text-sm">
        {translate('auto.components.right.sidebar.PortsPanel.1f0d2a24f9', 'No forwarded ports')}
      </p>
      <p className="mt-1 mb-3 text-xs">
        {translate(
          'auto.components.right.sidebar.PortsPanel.04efd3dad4',
          'Forward a port to access remote services on your local machine.'
        )}
      </p>
      <Button
        variant="default"
        size="xs"
        type="button"
        className="h-auto border-0 px-3 py-1.5"
        onClick={onAdd}
      >
        {translate('auto.components.right.sidebar.PortsPanel.907eb53ed2', 'Forward a Port')}
      </Button>
    </div>
  )
}
