import {
  LockKey as LockKeyhole,
  Play,
  TerminalWindow as SquareTerminal,
  WarningCircle as AlertCircle,
  ArrowCounterClockwise as RotateCcw
} from '@phosphor-icons/react'
import type React from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export type CoworkingSessionPanePhase =
  | 'terminal'
  | 'waiting-control'
  | 'continuing'
  | 'attaching'
  | 'closed'
  | 'ended'
  | 'continue-error'
  | 'attach-error'
  | 'reconnect-error'

export function CoworkingSessionContinuationNotice({
  phase,
  canControl,
  onRetry
}: {
  phase: Exclude<CoworkingSessionPanePhase, 'terminal'>
  canControl: boolean
  onRetry: () => void
}): React.JSX.Element {
  const loading = phase === 'continuing' || phase === 'attaching'
  const waiting = phase === 'waiting-control'
  const closed = phase === 'closed'
  const ended = phase === 'ended'
  const Icon = loading
    ? LoadingIndicator
    : waiting
      ? LockKeyhole
      : closed
        ? Play
        : ended
          ? SquareTerminal
          : AlertCircle
  const message = getContinuationMessage(phase, canControl)
  return (
    <div className="bg-background/90 absolute inset-0 flex items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <Icon
          aria-hidden="true"
          className={loading ? 'text-muted-foreground size-4' : 'text-muted-foreground size-5'}
        />
        <p className="text-muted-foreground text-xs leading-5">{message}</p>
        {phase === 'closed' && canControl ? (
          <Button type="button" size="xs" variant="outline" onClick={onRetry}>
            <Play aria-hidden="true" />
            {translate(
              'auto.components.coworking.CoworkingSessionPane.continueAgent',
              'Continue agent'
            )}
          </Button>
        ) : phase === 'continue-error' ||
          phase === 'attach-error' ||
          phase === 'reconnect-error' ? (
          <Button type="button" size="xs" variant="outline" onClick={onRetry}>
            <RotateCcw weight="regular" aria-hidden="true" />
            {phase === 'continue-error'
              ? translate(
                  'auto.components.coworking.CoworkingSessionPane.retryContinue',
                  'Try again'
                )
              : translate(
                  'auto.components.coworking.CoworkingSessionPane.retryAttach',
                  'Reconnect terminal'
                )}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function getContinuationMessage(
  phase: Exclude<CoworkingSessionPanePhase, 'terminal'>,
  canControl: boolean
): string {
  switch (phase) {
    case 'waiting-control':
      return canControl
        ? translate(
            'auto.components.coworking.CoworkingSessionPane.startingAfterGrant',
            'Starting the agent on the owner’s desktop…'
          )
        : translate(
            'auto.components.coworking.CoworkingSessionPane.controlRequired',
            'Request control to continue this agent session on the owner’s desktop.'
          )
    case 'continuing':
      return translate(
        'auto.components.coworking.CoworkingSessionPane.continuing',
        'Continuing the agent on the owner’s desktop…'
      )
    case 'attaching':
      return translate(
        'auto.components.coworking.CoworkingSessionPane.attaching',
        'Connecting to the remote terminal…'
      )
    case 'closed':
      return canControl
        ? translate(
            'auto.components.coworking.CoworkingSessionPane.sessionEnded',
            'This agent session has ended.'
          )
        : translate(
            'auto.components.coworking.CoworkingSessionPane.controlRequiredAfterClose',
            'Request control to continue this agent session again.'
          )
    case 'ended':
      return translate(
        'auto.components.coworking.CoworkingSessionPane.terminalEnded',
        'This terminal session has ended.'
      )
    case 'continue-error':
      return translate(
        'auto.components.coworking.CoworkingSessionPane.continueFailed',
        'Could not continue this agent session.'
      )
    case 'attach-error':
      return translate(
        'auto.components.coworking.CoworkingSessionPane.attachFailed',
        'The agent started, but its terminal could not be connected.'
      )
    case 'reconnect-error':
      return translate(
        'auto.components.coworking.CoworkingSessionPane.terminalConnectionLost',
        'The remote terminal connection was lost.'
      )
  }
}
