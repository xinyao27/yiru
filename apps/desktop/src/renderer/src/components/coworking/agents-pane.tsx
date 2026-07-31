import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react'
import type React from 'react'
import { useMemo } from 'react'
import type { CoworkingWorkspaceRoute } from '~renderer/components/coworking/types'
import { LEGEND_LIST_SCROLL_AREA_PROPS } from '~renderer/components/sidebar/list-scroll-area'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'
import { AgentIcon, getAgentLabel } from '~renderer/lib/agent-catalog'
import { cn } from '~renderer/lib/class-names'
import { useAppStore } from '~renderer/store'
import type {
  CoworkingSessionCatalogEntry,
  CoworkingSessionCatalogPageState
} from '~shared/coworking/catalog-contract'

import { AiVaultPanelNotice, AiVaultPanelSurface } from '../workspace-panel/ai-vault/panel-surface'
import { getCoworkingSessionCatalogStatusLabel } from './session-catalog-status'

// Why: an agent row is a two-line 53px button; LegendList measures the real
// heights after the first paint and only needs this hint for the initial window.
const AGENT_ROW_ESTIMATED_HEIGHT = 53

type CoworkingAgentSession = Extract<CoworkingSessionCatalogEntry, { kind: 'agent' }>

function getAgentSessionRowKey(session: CoworkingAgentSession): string {
  return session.sessionRef
}

export function CoworkingAgentsPane({
  route,
  sessions,
  catalogStatus
}: {
  route: CoworkingWorkspaceRoute
  sessions: readonly CoworkingSessionCatalogEntry[]
  catalogStatus: CoworkingSessionCatalogPageState['status']
}): React.JSX.Element {
  const setActiveRoute = useAppStore((state) => state.setActiveCoworkingWorkspaceRoute)
  const statusLabel = getCoworkingSessionCatalogStatusLabel(catalogStatus)
  const agentSessions = useMemo(
    () => sessions.filter((session) => session.kind === 'agent'),
    [sessions]
  )
  const emptyNotice =
    catalogStatus !== 'loading' && agentSessions.length === 0 ? (
      <div className="text-muted-foreground px-4 py-10 text-center text-xs">
        {translate(
          'auto.components.coworking.CoworkingAgentsPane.noAgentSessions',
          'No public agent sessions in this worktree.'
        )}
      </div>
    ) : null

  return (
    <AiVaultPanelSurface>
      <div className="border-sidebar-border flex h-9 shrink-0 items-center justify-between border-b px-3">
        <span className="text-foreground text-[11px] font-semibold tracking-wider uppercase">
          {translate(
            'auto.components.coworking.CoworkingAgentsPane.publicSessions',
            'Public agents'
          )}
        </span>
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {agentSessions.length}
        </span>
      </div>

      {statusLabel ? (
        <AiVaultPanelNotice
          loading={catalogStatus === 'loading'}
          tone={catalogStatus === 'error' ? 'destructive' : 'muted'}
        >
          {statusLabel}
        </AiVaultPanelNotice>
      ) : null}

      <div className="min-h-0 flex-1">
        {/* Why: one legal catalog can materialize 55k rows; the sidebar must keep DOM growth bounded. */}
        <LegendList<CoworkingAgentSession>
          {...LEGEND_LIST_SCROLL_AREA_PROPS}
          data={agentSessions}
          keyExtractor={getAgentSessionRowKey}
          estimatedItemSize={AGENT_ROW_ESTIMATED_HEIGHT}
          ListFooterComponent={emptyNotice}
          renderItem={({ item: session }: LegendListRenderItemProps<CoworkingAgentSession>) => {
            const active = route.sessionRef === session.sessionRef
            return (
              <Button
                variant="outline"
                size="xs"
                type="button"
                data-current={active ? 'true' : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'border-sidebar-border flex h-auto w-full min-w-0 gap-2 border-b px-3 py-2 text-left transition-colors',
                  'focus-visible:outline-none',
                  active && 'bg-accent text-accent-foreground'
                )}
                onClick={() => setActiveRoute({ ...route, sessionRef: session.sessionRef })}
              >
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <AgentIcon agent={session.agent} size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-[13px] font-medium">
                    {session.title}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-[11px]">
                    {agentProviderLabel(session)}
                  </span>
                </span>
              </Button>
            )
          }}
        />
      </div>
    </AiVaultPanelSurface>
  )
}

function agentProviderLabel(session: CoworkingAgentSession): string {
  return session.agent
    ? getAgentLabel(session.agent)
    : translate('auto.components.coworking.CoworkingAgentsPane.unknownAgent', 'Agent')
}
