import { ArrowClockwise as RefreshCw } from '@phosphor-icons/react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CoworkingWorkspaceRoute } from '~renderer/components/coworking/types'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Button } from '~renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { translate } from '~renderer/i18n/i18n'
import type { CoworkingChecksReadResult } from '~shared/coworking/operation-contract'

import { CoworkingChecksResult } from './checks-result'
import { parseCoworkingChecksReadResult } from './owner-result-validation'
import {
  invokeCoworkingWorkspaceRead,
  CoworkingWorkspaceOperationError
} from './workspace-operation'
import { useCoworkingWorktreeOperationRoute } from './worktree-route'

export type CoworkingChecksReadState = {
  result: CoworkingChecksReadResult | null
  loading: boolean
  error: boolean
  refresh: () => Promise<void>
}

export function useCoworkingChecksReadState(
  route: CoworkingWorkspaceRoute,
  enabled: boolean
): CoworkingChecksReadState {
  const operationRoute = useCoworkingWorktreeOperationRoute(route)
  const [result, setResult] = useState<CoworkingChecksReadResult | null>(null)
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
      const value = await invokeCoworkingWorkspaceRead(operationRoute, 'checks.read', {})
      const nextResult = parseCoworkingChecksReadResult(value)
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
      // Why: invalidate any in-flight request so a late response cannot write
      // a stale result back in once this surface is re-enabled.
      requestSequence.current += 1
      return
    }
    void refresh()
    return () => {
      requestSequence.current += 1
    }
  }, [enabled, refresh])

  return {
    // Why: a closed or disconnected remote surface must not retain an owner
    // status indicator, so the disabled view is derived rather than reset.
    result: enabled ? result : null,
    loading: enabled ? loading : false,
    error: enabled ? error : false,
    refresh
  }
}

export function CoworkingChecksPane({
  state
}: {
  state: CoworkingChecksReadState
}): React.JSX.Element {
  const { result, loading, error, refresh } = state
  return (
    <div className="bg-sidebar flex h-full min-h-0 flex-col">
      <div className="border-sidebar-border flex h-9 shrink-0 items-center justify-between border-b px-3">
        <span className="text-foreground text-[11px] font-semibold tracking-wider uppercase">
          {translate('auto.components.coworking.CoworkingChecksPane.reviewChecks', 'Review checks')}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="focus-visible:border-sidebar-ring"
                disabled={loading}
                onClick={() => void refresh()}
                aria-label={translate(
                  'auto.components.coworking.CoworkingChecksPane.refresh',
                  'Refresh'
                )}
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
            {translate('auto.components.coworking.CoworkingChecksPane.refresh', 'Refresh')}
          </TooltipContent>
        </Tooltip>
      </div>

      {error ? (
        <div className="border-sidebar-border text-destructive border-b px-3 py-2 text-xs">
          {translate(
            'auto.components.coworking.CoworkingChecksPane.loadFailed',
            'Could not load checks from the owner.'
          )}
        </div>
      ) : null}

      {loading && !result ? <CoworkingChecksLoading /> : null}
      {!loading && error ? <CoworkingChecksUnavailable /> : null}
      {!loading && !error && result?.review === null && result.detailStatus === 'unavailable' ? (
        <CoworkingChecksUnavailable />
      ) : null}
      {!loading && !error && result?.review === null && result.detailStatus !== 'unavailable' ? (
        <CoworkingChecksEmpty />
      ) : null}
      {result?.review ? <CoworkingChecksResult result={result} /> : null}
    </div>
  )
}

function CoworkingChecksLoading(): React.JSX.Element {
  return (
    <div
      role="status"
      className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-xs"
    >
      <LoadingIndicator aria-hidden="true" className="size-4" />
      {translate('auto.components.coworking.CoworkingChecksPane.loading', 'Loading checks…')}
    </div>
  )
}

function CoworkingChecksEmpty(): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex flex-1 items-center justify-center px-4 text-center text-xs">
      {translate(
        'auto.components.coworking.CoworkingChecksPane.noReview',
        'No hosted review was found for this branch.'
      )}
    </div>
  )
}

function CoworkingChecksUnavailable(): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex flex-1 items-center justify-center px-4 text-center text-xs">
      {translate(
        'auto.components.coworking.CoworkingChecksPane.unavailable',
        'Hosted review details are unavailable from the owner.'
      )}
    </div>
  )
}

function isStaleRouteError(error: unknown): boolean {
  return error instanceof CoworkingWorkspaceOperationError && error.code === 'stale_route'
}
