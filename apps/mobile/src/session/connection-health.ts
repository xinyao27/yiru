import { classifyConnection, verdictDisplayLabel } from '~/transport/connection-health'
import type { ConnectionState } from '~/transport/types'

import { MOBILE_SESSION_STATUS_LABELS } from './status-labels'

export type MobileSessionConnectionHealth = {
  showConnectionRetry: boolean
  terminalSummary: string
}

// Resolves what the session header says about the transport: the tap-to-retry
// affordance and the status line beneath the workspace name.
//
// Why: the reconnect loop slows to a 90s trickle at its give-up cap; surface
// tap-to-retry once the verdict escalates so recovery doesn't wait out the
// trickle timer (issue #5049).
export function resolveMobileSessionConnectionHealth(args: {
  connState: ConnectionState
  reconnectAttempts: number
  lastConnectedAt: number | null
  endpoint: string | null
  showLoadingState: boolean
  visibleTabCount: number
}): MobileSessionConnectionHealth {
  const verdict = classifyConnection({
    state: args.connState,
    reconnectAttempts: args.reconnectAttempts,
    lastConnectedAt: args.lastConnectedAt,
    endpoint: args.endpoint
  })
  const showConnectionRetry = verdict.kind === 'warning' || verdict.kind === 'unreachable'
  return {
    showConnectionRetry,
    terminalSummary:
      args.connState === 'connected'
        ? args.showLoadingState
          ? 'Loading tabs'
          : args.visibleTabCount === 1
            ? '1 tab'
            : `${args.visibleTabCount} tabs`
        : showConnectionRetry
          ? `${verdictDisplayLabel(verdict)} — tap to retry`
          : MOBILE_SESSION_STATUS_LABELS[args.connState]
  }
}
