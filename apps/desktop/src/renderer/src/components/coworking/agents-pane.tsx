import { useVirtualizer } from '@tanstack/react-virtual'
import type React from 'react'
import { useMemo, useRef } from 'react'

import type { CoworkingWorkspaceRoute } from '@/components/coworking/types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { cn } from '@/lib/class-names'
import { useAppStore } from '@/store'

import type {
  CoworkingSessionCatalogEntry,
  CoworkingSessionCatalogPageState
} from '../../../../shared/coworking/catalog-contract'
import { AiVaultPanelNotice, AiVaultPanelSurface } from '../workspace-panel/ai-vault/panel-surface'
import { getCoworkingSessionCatalogStatusLabel } from './session-catalog-status'

const AGENT_ROW_ESTIMATED_HEIGHT = 53
const AGENT_ROW_OVERSCAN = 8

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const agentSessions = useMemo(
    () => sessions.filter((session) => session.kind === 'agent'),
    [sessions]
  )
  // Why: one legal catalog can materialize 55k rows; the sidebar must keep DOM growth bounded.
  const virtualizer = useVirtualizer({
    count: agentSessions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => AGENT_ROW_ESTIMATED_HEIGHT,
    overscan: AGENT_ROW_OVERSCAN,
    getItemKey: (index) => agentSessions[index]?.sessionRef ?? index
  })

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

      <div ref={scrollRef} className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        {agentSessions.length > 0 ? (
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const session = agentSessions[virtualRow.index]
              if (!session) {
                return null
              }
              const active = route.sessionRef === session.sessionRef
              return (
                <Button
                  variant="outline"
                  size="xs"
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  type="button"
                  data-current={active ? 'true' : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'h-auto w-auto gap-2 py-2 absolute left-0 top-0 flex w-full min-w-0 border-b border-sidebar-border px-3 text-left transition-colors',
                    'focus-visible:outline-none',
                    active && 'bg-accent text-accent-foreground'
                  )}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
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
            })}
          </div>
        ) : null}

        {catalogStatus !== 'loading' && agentSessions.length === 0 ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-xs">
            {translate(
              'auto.components.coworking.CoworkingAgentsPane.noAgentSessions',
              'No public agent sessions in this worktree.'
            )}
          </div>
        ) : null}
      </div>
    </AiVaultPanelSurface>
  )
}

function agentProviderLabel(
  session: Extract<CoworkingSessionCatalogEntry, { kind: 'agent' }>
): string {
  return session.agent
    ? getAgentLabel(session.agent)
    : translate('auto.components.coworking.CoworkingAgentsPane.unknownAgent', 'Agent')
}
