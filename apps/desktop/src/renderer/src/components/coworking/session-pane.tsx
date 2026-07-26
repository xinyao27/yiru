import type React from 'react'
import { useCallback } from 'react'

import { CoworkingSessionContinuationNotice } from './session-continuation-notice'
import type { CoworkingSessionRoute } from './session-route'
import { CoworkingTerminalPane } from './terminal-pane'
import { useCoworkingSessionContinuation } from './use-session-continuation'

export function CoworkingSessionPane({
  route,
  retainMissingSession = false,
  focusRequested = false,
  onFocusHandled
}: {
  route: CoworkingSessionRoute
  retainMissingSession?: boolean
  focusRequested?: boolean
  onFocusHandled?: (sessionRef: string) => void
}): React.JSX.Element {
  const {
    phase,
    canControl,
    terminalAttempt,
    handleSubscriptionError,
    handleLive,
    handleClosed,
    retry
  } = useCoworkingSessionContinuation(route, retainMissingSession)

  const handleFocus = useCallback((): void => {
    onFocusHandled?.(route.sessionRef)
  }, [onFocusHandled, route.sessionRef])

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <CoworkingTerminalPane
        key={terminalAttempt}
        route={route}
        focusRequested={focusRequested}
        onFocusHandled={handleFocus}
        onSubscriptionError={handleSubscriptionError}
        onLive={handleLive}
        onClosed={handleClosed}
      />
      {phase !== 'terminal' ? (
        <CoworkingSessionContinuationNotice phase={phase} canControl={canControl} onRetry={retry} />
      ) : null}
    </div>
  )
}
