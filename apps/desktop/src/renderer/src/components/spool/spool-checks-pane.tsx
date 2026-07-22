import { ArrowClockwise as RefreshCw } from '@phosphor-icons/react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'

import type { SpoolChecksReadResult } from '../../../../shared/spool/spool-operation-contract'
import { SpoolChecksResult } from './spool-checks-result'
import { parseSpoolChecksReadResult } from './spool-owner-result-validation'
import { invokeSpoolWorkspaceRead, SpoolWorkspaceOperationError } from './spool-workspace-operation'
import { useSpoolWorktreeOperationRoute } from './spool-worktree-route'

export type SpoolChecksReadState = {
  result: SpoolChecksReadResult | null
  loading: boolean
  error: boolean
  refresh: () => Promise<void>
}

export function useSpoolChecksReadState(
  route: SpoolWorkspaceRoute,
  enabled: boolean
): SpoolChecksReadState {
  const operationRoute = useSpoolWorktreeOperationRoute(route)
  const [result, setResult] = useState<SpoolChecksReadResult | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(false)
  const requestSequence = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) {
      return
    }
    const request = ++requestSequence.current
    // Why: remote checks carry no freshness token; once refresh starts, the
    // previous result must stop driving both the pane and activity status.
    setResult(null)
    setLoading(true)
    setError(false)
    try {
      const value = await invokeSpoolWorkspaceRead(operationRoute, 'checks.read', {})
      const nextResult = parseSpoolChecksReadResult(value)
      if (request === requestSequence.current) {
        setResult(nextResult)
      }
    } catch (caught) {
      if (request === requestSequence.current && !isStaleRouteError(caught)) {
        setError(true)
      }
    } finally {
      if (request === requestSequence.current) {
        setLoading(false)
      }
    }
  }, [enabled, operationRoute])

  useEffect(() => {
    if (!enabled) {
      // Why: a closed or disconnected remote surface must not retain an owner status indicator.
      requestSequence.current += 1
      setResult(null)
      setError(false)
      setLoading(false)
      return
    }
    void refresh()
    return () => {
      requestSequence.current += 1
    }
  }, [enabled, refresh])

  return { result, loading, error, refresh }
}

export function SpoolChecksPane({ state }: { state: SpoolChecksReadState }): React.JSX.Element {
  const { result, loading, error, refresh } = state
  return (
    <div className="bg-sidebar flex h-full min-h-0 flex-col">
      <div className="border-sidebar-border flex h-9 shrink-0 items-center justify-between border-b px-3">
        <span className="text-foreground text-[11px] font-semibold tracking-wider uppercase">
          {translate('auto.components.spool.SpoolChecksPane.reviewChecks', 'Review checks')}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-sidebar-ring dark:hover:bg-sidebar-accent/50"
                disabled={loading}
                onClick={() => void refresh()}
                aria-label={translate('auto.components.spool.SpoolChecksPane.refresh', 'Refresh')}
              >
                {loading ? (
                  <LoadingIndicator className="size-3.5" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={4}>
            {translate('auto.components.spool.SpoolChecksPane.refresh', 'Refresh')}
          </TooltipContent>
        </Tooltip>
      </div>

      {error ? (
        <div className="border-sidebar-border text-destructive border-b px-3 py-2 text-xs">
          {translate(
            'auto.components.spool.SpoolChecksPane.loadFailed',
            'Could not load checks from the owner.'
          )}
        </div>
      ) : null}

      {loading && !result ? <SpoolChecksLoading /> : null}
      {!loading && error ? <SpoolChecksUnavailable /> : null}
      {!loading && !error && result?.review === null && result.detailStatus === 'unavailable' ? (
        <SpoolChecksUnavailable />
      ) : null}
      {!loading && !error && result?.review === null && result.detailStatus !== 'unavailable' ? (
        <SpoolChecksEmpty />
      ) : null}
      {result?.review ? <SpoolChecksResult result={result} /> : null}
    </div>
  )
}

function SpoolChecksLoading(): React.JSX.Element {
  return (
    <div
      role="status"
      className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-xs"
    >
      <LoadingIndicator aria-hidden="true" className="size-4" />
      {translate('auto.components.spool.SpoolChecksPane.loading', 'Loading checks…')}
    </div>
  )
}

function SpoolChecksEmpty(): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex flex-1 items-center justify-center px-4 text-center text-xs">
      {translate(
        'auto.components.spool.SpoolChecksPane.noReview',
        'No hosted review was found for this branch.'
      )}
    </div>
  )
}

function SpoolChecksUnavailable(): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex flex-1 items-center justify-center px-4 text-center text-xs">
      {translate(
        'auto.components.spool.SpoolChecksPane.unavailable',
        'Hosted review details are unavailable from the owner.'
      )}
    </div>
  )
}

function isStaleRouteError(error: unknown): boolean {
  return error instanceof SpoolWorkspaceOperationError && error.code === 'stale_route'
}
