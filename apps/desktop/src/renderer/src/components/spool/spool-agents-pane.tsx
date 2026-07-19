import { useVirtualizer } from '@tanstack/react-virtual'
import type React from 'react'
import { useMemo, useRef } from 'react'

import {
  AiVaultPanelNotice,
  AiVaultPanelSurface
} from '@/components/right-sidebar/ai-vault-panel-surface'
import { translate } from '@/i18n/i18n'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { cn } from '@/lib/class-names'
import { useAppStore } from '@/store'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'

import type {
  SpoolSessionCatalogEntry,
  SpoolSessionCatalogPageState
} from '../../../../shared/spool/spool-catalog-contract'
import { getSpoolSessionCatalogStatusLabel } from './spool-session-catalog-status'

const AGENT_ROW_ESTIMATED_HEIGHT = 53
const AGENT_ROW_OVERSCAN = 8

export function SpoolAgentsPane({
  route,
  sessions,
  catalogStatus
}: {
  route: SpoolWorkspaceRoute
  sessions: readonly SpoolSessionCatalogEntry[]
  catalogStatus: SpoolSessionCatalogPageState['status']
}): React.JSX.Element {
  const setActiveRoute = useAppStore((state) => state.setActiveSpoolWorkspaceRoute)
  const statusLabel = getSpoolSessionCatalogStatusLabel(catalogStatus)
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
          {translate('auto.components.spool.SpoolAgentsPane.publicSessions', 'Public agents')}
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
                <button
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  type="button"
                  data-current={active ? 'true' : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'absolute left-0 top-0 flex w-full min-w-0 items-center gap-2 border-b border-sidebar-border px-3 py-2 text-left transition-colors',
                    'hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring',
                    active && 'bg-sidebar-accent text-sidebar-accent-foreground'
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
                </button>
              )
            })}
          </div>
        ) : null}

        {catalogStatus !== 'loading' && agentSessions.length === 0 ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-xs">
            {translate(
              'auto.components.spool.SpoolAgentsPane.noAgentSessions',
              'No public agent sessions in this worktree.'
            )}
          </div>
        ) : null}
      </div>
    </AiVaultPanelSurface>
  )
}

function agentProviderLabel(session: Extract<SpoolSessionCatalogEntry, { kind: 'agent' }>): string {
  return session.agent
    ? getAgentLabel(session.agent)
    : translate('auto.components.spool.SpoolAgentsPane.unknownAgent', 'Agent')
}
