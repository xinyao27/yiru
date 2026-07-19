import {
  Check,
  CaretRight as ChevronRight,
  CaretUpDown as ChevronsUpDown,
  Plus
} from '@phosphor-icons/react'
import { useState } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { Command, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { ExecutionHostId } from '../../../../shared/execution-host'
import { describeRuntimeCompatBlock } from '../../../../shared/protocol-compat'
import { canConnectAddRepoHost, canSelectAddRepoHost } from './add-repo-host-availability'
import type { SidebarHostOption } from './sidebar-host-options'
import { getSidebarHostHealthLabel, shouldShowHostScopeControls } from './sidebar-host-options'

type AddRepoHostSelectorProps = {
  hosts: SidebarHostOption[]
  selectedHostId: ExecutionHostId
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectHost: (hostId: ExecutionHostId) => void
  onConnectHost?: (hostId: ExecutionHostId) => void
  onAddSshHost?: () => void
  onAddRemoteServer?: () => void
}

function getHostStatusDetail(host: SidebarHostOption): string {
  if (host.compatibility?.kind === 'blocked') {
    return describeRuntimeCompatBlock(host.compatibility)
  }
  return `${getSidebarHostHealthLabel(host.health)}${host.detail ? ` - ${host.detail}` : ''}`
}

export function AddRepoHostSelector({
  hosts,
  selectedHostId,
  open,
  onOpenChange,
  onSelectHost,
  onConnectHost,
  onAddSshHost,
  onAddRemoteServer
}: AddRepoHostSelectorProps): React.JSX.Element | null {
  const [addHostOpen, setAddHostOpen] = useState(false)
  const showHostSetupActions = Boolean(onAddSshHost || onAddRemoteServer)
  if (!shouldShowHostScopeControls(hosts) && !showHostSetupActions) {
    return null
  }

  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? hosts[0]
  if (!selectedHost) {
    return null
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground font-medium">
        {translate('auto.components.sidebar.AddRepoHostSelector.host', 'Host')}
      </span>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              role="combobox"
              aria-expanded={open}
              className="border-border bg-muted/30 text-foreground hover:bg-accent hover:text-accent-foreground h-7 max-w-[18rem] min-w-0 gap-1.5 rounded-md border px-2 text-xs font-medium"
            >
              <span className="min-w-0 truncate">{selectedHost.label}</span>
              {selectedHost.health !== 'local' ? (
                <span
                  title={getHostStatusDetail(selectedHost)}
                  className="text-muted-foreground shrink-0 text-[11px] font-normal"
                >
                  {getSidebarHostHealthLabel(selectedHost.health)}
                </span>
              ) : null}
              <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
            </Button>
          }
        />
        <PopoverContent
          align="start"
          className="w-[min(340px,calc(100vw-1rem))] min-w-[var(--radix-popover-trigger-width)] p-0"
        >
          <Command>
            <CommandList>
              {showHostSetupActions ? (
                <Popover open={addHostOpen} onOpenChange={setAddHostOpen}>
                  <PopoverTrigger
                    render={
                      <CommandItem
                        value="Add remote host SSH host Yiru server"
                        onSelect={() => setAddHostOpen(true)}
                        className="text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground items-start gap-2 px-3 py-2 text-xs"
                      >
                        <Plus className="mt-0.5 size-3 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium">
                              {translate(
                                'auto.components.sidebar.AddRepoHostSelector.addRemoteHost',
                                'Add remote host'
                              )}
                            </span>
                          </span>
                          <span className="text-muted-foreground mt-0.5 block truncate text-[11px]">
                            {translate(
                              'auto.components.sidebar.AddRepoHostSelector.addRemoteHostDetail',
                              'SSH host or Yiru server'
                            )}
                          </span>
                        </span>
                        <ChevronRight className="mt-0.5 size-3.5 shrink-0" />
                      </CommandItem>
                    }
                  />
                  <PopoverContent align="start" side="right" className="w-72 p-1" sideOffset={8}>
                    {onAddSshHost ? (
                      <button
                        type="button"
                        className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 flex w-full flex-col rounded-sm px-2.5 py-2 text-left focus-visible:ring-[3px] focus-visible:outline-none"
                        onClick={() => {
                          setAddHostOpen(false)
                          onOpenChange(false)
                          onAddSshHost()
                        }}
                      >
                        <span className="text-xs font-medium">
                          {translate(
                            'auto.components.sidebar.AddRepoHostSelector.addSshHost',
                            'Add SSH host'
                          )}
                        </span>
                        <span className="text-muted-foreground mt-0.5 text-[11px]">
                          {translate(
                            'auto.components.sidebar.AddRepoHostSelector.addSshHostDetail',
                            'Use an existing machine over SSH.'
                          )}
                        </span>
                      </button>
                    ) : null}
                    {onAddRemoteServer ? (
                      <button
                        type="button"
                        className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 flex w-full flex-col rounded-sm px-2.5 py-2 text-left focus-visible:ring-[3px] focus-visible:outline-none"
                        onClick={() => {
                          setAddHostOpen(false)
                          onOpenChange(false)
                          onAddRemoteServer()
                        }}
                      >
                        <span className="text-xs font-medium">
                          {translate(
                            'auto.components.sidebar.AddRepoHostSelector.addRemoteServer',
                            'Add remote server'
                          )}
                        </span>
                        <span className="text-muted-foreground mt-0.5 text-[11px]">
                          {translate(
                            'auto.components.sidebar.AddRepoHostSelector.addRemoteServerDetail',
                            'Pair with Yiru running on another computer.'
                          )}
                        </span>
                      </button>
                    ) : null}
                  </PopoverContent>
                </Popover>
              ) : null}
              {hosts.map((host) => {
                const selected = host.id === selectedHostId
                const disabled = !canSelectAddRepoHost(host)
                const canConnect = canConnectAddRepoHost(host)
                const isConnecting = host.health === 'connecting'
                return (
                  <CommandItem
                    key={host.id}
                    value={`${host.label} ${host.detail}`}
                    disabled={disabled && !canConnect}
                    aria-disabled={disabled}
                    onSelect={() => {
                      if (disabled) {
                        return
                      }
                      onSelectHost(host.id)
                      onOpenChange(false)
                    }}
                    className={cn(
                      'items-start gap-2 px-3 py-2 text-xs',
                      disabled && !canConnect && 'cursor-not-allowed opacity-55'
                    )}
                  >
                    <Check
                      className={cn(
                        'mt-0.5 size-3 text-muted-foreground',
                        selected ? 'opacity-70' : 'opacity-0'
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{host.label}</span>
                      </span>
                      <span className="text-muted-foreground mt-0.5 block truncate text-[11px]">
                        <span className="min-w-0 flex-1 truncate">{getHostStatusDetail(host)}</span>
                      </span>
                    </span>
                    {canConnect ? (
                      <Button
                        type="button"
                        variant="link"
                        size="xs"
                        className="text-muted-foreground hover:text-foreground ml-2 h-auto w-[5.75rem] shrink-0 justify-end gap-1 self-center px-0 py-0 text-[11px] font-normal hover:no-underline"
                        disabled={isConnecting}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          onConnectHost?.(host.id)
                        }}
                      >
                        {isConnecting ? <LoadingIndicator className="size-3" /> : null}
                        {isConnecting
                          ? translate(
                              'auto.components.sidebar.AddRepoHostSelector.connecting',
                              'Connecting'
                            )
                          : translate(
                              'auto.components.sidebar.AddRepoHostSelector.connect',
                              'Connect'
                            )}
                      </Button>
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
