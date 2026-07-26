import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { CoworkingWorkspaceRoute } from '@/components/coworking/types'
import { LoadingIndicator } from '@/components/loading-indicator'
import { AgentLaunchMenuItems } from '@/components/tab-bar/agent-launch-menu-items'
import {
  buildTabAgentLaunchOptions,
  orderTabLaunchAgents
} from '@/components/tab-bar/tab-agent-launch-options'
import {
  WorkspaceNewTerminalMenuItem,
  WorkspaceTabCreateMenu
} from '@/components/tab-bar/workspace-tab-create-menu'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'

import type { CoworkingSessionCatalogEntry } from '../../../../shared/coworking/catalog-contract'
import type {
  CoworkingTerminalCreateOperation,
  CoworkingTerminalLaunchOptionsResult
} from '../../../../shared/coworking/operation-contract'
import type { WorkspacePanelTabContentType } from '../../../../shared/types'
import type { ActivityBarItem } from '../workspace-panel/activity-bar-buttons'
import {
  parseCoworkingTerminalCreateResult,
  parseCoworkingTerminalLaunchOptionsResult
} from './owner-result-validation'
import { getCoworkingRequesterTransportErrorCode } from './requester-error'
import {
  invokeCoworkingWorkspaceMutation,
  invokeCoworkingWorkspaceRead,
  CoworkingWorkspaceOperationError
} from './workspace-operation'

type CoworkingTerminalLaunch = CoworkingTerminalCreateOperation['launch']

type LaunchOptionsState =
  | { status: 'unavailable' | 'loading' | 'error' }
  | { status: 'ready'; value: CoworkingTerminalLaunchOptionsResult }

export function CoworkingSessionCreateMenu({
  route,
  connected,
  canControl,
  onCreated,
  panelItems,
  onOpenPanel
}: {
  route: CoworkingWorkspaceRoute
  connected: boolean
  canControl: boolean
  onCreated: (session: CoworkingSessionCatalogEntry) => void
  panelItems: readonly ActivityBarItem[]
  onOpenPanel: (panel: WorkspacePanelTabContentType) => void
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
      const value = await invokeCoworkingWorkspaceRead(route, 'terminal.launchOptions', {})
      if (request === launchOptionsRequestRef.current) {
        setLaunchOptions({
          status: 'ready',
          value: parseCoworkingTerminalLaunchOptionsResult(value)
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
    async (launch: CoworkingTerminalLaunch): Promise<void> => {
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
        const value = await invokeCoworkingWorkspaceMutation(route, 'terminal.create', {
          clientMutationId: createBrowserUuid(),
          launch
        })
        responseReceived = true
        const result = parseCoworkingTerminalCreateResult(value)
        onCreated({ sessionRef: result.sessionRef, ...result.session })
      } catch (error) {
        if (error instanceof CoworkingWorkspaceOperationError && error.code === 'stale_route') {
          return
        }
        if (
          responseReceived ||
          getCoworkingRequesterTransportErrorCode(error) === 'outcome_unknown'
        ) {
          toast.warning(
            translate(
              'auto.components.coworking.CoworkingSessionCreateMenu.outcomeUnknown',
              'The terminal may already be running on the owner desktop. Creation was not retried.'
            )
          )
          return
        }
        toast.error(
          translate(
            'auto.components.coworking.CoworkingSessionCreateMenu.createFailed',
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
  const terminalCreationDisabled = !connected || !canControl || creating

  return (
    <WorkspaceTabCreateMenu open={open} onOpenChange={handleOpenChange} finalFocus={() => false}>
      <WorkspaceNewTerminalMenuItem
        disabled={terminalCreationDisabled}
        onSelect={() => void createSession({ kind: 'shell' })}
      />
      <DropdownMenuSeparator />
      {launchOptions.status === 'ready' && canControl ? (
        <AgentLaunchMenuItems
          options={agentOptions}
          onLaunch={(agent) => void createSession({ kind: 'agent', agent })}
          emptyLabel={translate(
            'auto.components.coworking.CoworkingSessionCreateMenu.noAgents',
            'No agents available'
          )}
        />
      ) : (
        <DropdownMenuItem
          disabled
          className="text-muted-foreground gap-2 px-2 py-1.5 text-[12px] leading-5"
        >
          {launchOptions.status === 'loading' ? (
            <LoadingIndicator aria-hidden="true" className="size-3.5" />
          ) : null}
          {launchOptions.status === 'loading'
            ? translate(
                'auto.components.coworking.CoworkingSessionCreateMenu.loadingAgents',
                'Loading owner agents…'
              )
            : translate(
                'auto.components.coworking.CoworkingSessionCreateMenu.agentsUnavailable',
                'Owner agents unavailable'
              )}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      {panelItems.map((item) => {
        const Icon = item.icon
        return (
          <DropdownMenuItem key={item.id} onClick={() => onOpenPanel(item.id)}>
            <Icon className="size-4" />
            <span className="flex-1">{item.title}</span>
            {item.shortcut ? <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut> : null}
          </DropdownMenuItem>
        )
      })}
    </WorkspaceTabCreateMenu>
  )
}
