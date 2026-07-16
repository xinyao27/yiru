import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { SpoolSessionCatalogEntry } from '../../../../shared/spool/spool-catalog-contract'
import type { SpoolRequesterControlView } from '../../../../shared/spool/spool-ipc-contract'
import type {
  SpoolTerminalCreateOperation,
  SpoolTerminalLaunchOptionsResult
} from '../../../../shared/spool/spool-operation-contract'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'
import { AgentLaunchMenuItems } from '@/components/tab-bar/AgentLaunchMenuItems'
import {
  WorkspaceNewTerminalMenuItem,
  WorkspaceTabCreateMenu
} from '@/components/tab-bar/WorkspaceTabCreateMenu'
import {
  buildTabAgentLaunchOptions,
  orderTabLaunchAgents
} from '@/components/tab-bar/tab-agent-launch-options'
import {
  parseSpoolTerminalCreateResult,
  parseSpoolTerminalLaunchOptionsResult
} from './spool-owner-result-validation'
import { getSpoolRequesterTransportErrorCode } from './spool-requester-error'
import {
  invokeSpoolWorkspaceMutation,
  invokeSpoolWorkspaceRead,
  SpoolWorkspaceOperationError
} from './spool-workspace-operation'

type SpoolTerminalLaunch = SpoolTerminalCreateOperation['launch']

type LaunchOptionsState =
  | { status: 'unavailable' | 'loading' | 'error' }
  | { status: 'ready'; value: SpoolTerminalLaunchOptionsResult }

export function SpoolSessionCreateMenu({
  route,
  connected,
  canControl,
  controlState,
  onCreated
}: {
  route: SpoolWorkspaceRoute
  connected: boolean
  canControl: boolean
  controlState: SpoolRequesterControlView['status']
  onCreated: (session: SpoolSessionCatalogEntry) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false)
  const launchOptionsRequestRef = useRef(0)
  const [launchOptions, setLaunchOptions] = useState<LaunchOptionsState>({
    status: 'unavailable'
  })

  useEffect(() => {
    if (!connected || !canControl) {
      launchOptionsRequestRef.current += 1
      setLaunchOptions({ status: 'unavailable' })
      setOpen(false)
    }
    return () => {
      launchOptionsRequestRef.current += 1
    }
  }, [canControl, connected, route.connectionEpoch, route.desktopRef, route.worktreeRef])

  const refreshLaunchOptions = useCallback(async (): Promise<void> => {
    const request = ++launchOptionsRequestRef.current
    setLaunchOptions({ status: 'loading' })
    try {
      const value = await invokeSpoolWorkspaceRead(route, 'terminal.launchOptions', {})
      if (request === launchOptionsRequestRef.current) {
        setLaunchOptions({
          status: 'ready',
          value: parseSpoolTerminalLaunchOptionsResult(value)
        })
      }
    } catch {
      if (request === launchOptionsRequestRef.current) {
        setLaunchOptions({ status: 'error' })
      }
    }
  }, [route])

  const handleOpenChange = useCallback(
    (nextOpen: boolean): void => {
      setOpen(nextOpen)
      if (nextOpen && connected && canControl) {
        // Why: owner agent detection and disabled-agent settings can change
        // while one physical control grant remains active.
        void refreshLaunchOptions()
      }
    },
    [canControl, connected, refreshLaunchOptions]
  )

  const createSession = useCallback(
    async (launch: SpoolTerminalLaunch): Promise<void> => {
      if (creatingRef.current || !connected || !canControl) {
        return
      }
      // Why: disabling and closing before the SSH/relay round trip prevents
      // double activation without relying on owner-side deduplication alone.
      creatingRef.current = true
      setOpen(false)
      setCreating(true)
      let responseReceived = false
      try {
        const value = await invokeSpoolWorkspaceMutation(route, 'terminal.create', {
          clientMutationId: createBrowserUuid(),
          launch
        })
        responseReceived = true
        const result = parseSpoolTerminalCreateResult(value)
        onCreated({ sessionRef: result.sessionRef, ...result.session })
      } catch (error) {
        if (error instanceof SpoolWorkspaceOperationError && error.code === 'stale_route') {
          return
        }
        if (responseReceived || getSpoolRequesterTransportErrorCode(error) === 'outcome_unknown') {
          toast.warning(
            translate(
              'auto.components.spool.SpoolSessionCreateMenu.outcomeUnknown',
              'The terminal may already be running on the owner desktop. Creation was not retried.'
            )
          )
          return
        }
        toast.error(
          translate(
            'auto.components.spool.SpoolSessionCreateMenu.createFailed',
            'Could not create the terminal.'
          )
        )
      } finally {
        creatingRef.current = false
        setCreating(false)
      }
    },
    [canControl, connected, onCreated, route]
  )

  const agentOptions = useMemo(() => {
    if (launchOptions.status !== 'ready') {
      return []
    }
    return buildTabAgentLaunchOptions(
      orderTabLaunchAgents(launchOptions.value.defaultAgent, launchOptions.value.agents)
    )
  }, [launchOptions])
  const disabledTooltip = getCreateMenuDisabledTooltip({
    connected,
    canControl,
    controlState,
    creating
  })

  return (
    <WorkspaceTabCreateMenu
      open={open}
      onOpenChange={handleOpenChange}
      disabled={disabledTooltip !== null}
      disabledTooltip={disabledTooltip}
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      <WorkspaceNewTerminalMenuItem onSelect={() => void createSession({ kind: 'shell' })} />
      <DropdownMenuSeparator />
      {launchOptions.status === 'ready' ? (
        <AgentLaunchMenuItems
          options={agentOptions}
          onLaunch={(agent) => void createSession({ kind: 'agent', agent })}
          emptyLabel={translate(
            'auto.components.spool.SpoolSessionCreateMenu.noAgents',
            'No agents available'
          )}
        />
      ) : (
        <DropdownMenuItem
          disabled
          className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 text-muted-foreground"
        >
          {launchOptions.status === 'loading' ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : null}
          {launchOptions.status === 'loading'
            ? translate(
                'auto.components.spool.SpoolSessionCreateMenu.loadingAgents',
                'Loading owner agents…'
              )
            : translate(
                'auto.components.spool.SpoolSessionCreateMenu.agentsUnavailable',
                'Owner agents unavailable'
              )}
        </DropdownMenuItem>
      )}
    </WorkspaceTabCreateMenu>
  )
}

function getCreateMenuDisabledTooltip({
  connected,
  canControl,
  controlState,
  creating
}: {
  connected: boolean
  canControl: boolean
  controlState: SpoolRequesterControlView['status']
  creating: boolean
}): string | null {
  if (!connected) {
    return translate(
      'auto.components.spool.SpoolSessionCreateMenu.disconnected',
      'Reconnect to create terminals.'
    )
  }
  if (!canControl) {
    if (controlState === 'pending') {
      return translate(
        'auto.components.spool.SpoolSessionCreateMenu.controlPending',
        'Waiting for the owner to approve control.'
      )
    }
    return translate(
      'auto.components.spool.SpoolSessionCreateMenu.controlRequired',
      'Request control to create terminals.'
    )
  }
  if (creating) {
    return translate('auto.components.spool.SpoolSessionCreateMenu.creating', 'Creating terminal…')
  }
  return null
}
