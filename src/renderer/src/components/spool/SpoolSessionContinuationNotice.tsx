import type React from 'react'
import {
  ArrowCounterClockwise as RotateCcw,
  LockKey as LockKeyhole,
  Play,
  SpinnerGap as Loader2,
  TerminalWindow as SquareTerminal,
  WarningCircle as AlertCircle
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export type SpoolSessionPanePhase =
  | 'terminal'
  | 'waiting-control'
  | 'continuing'
  | 'attaching'
  | 'closed'
  | 'ended'
  | 'continue-error'
  | 'attach-error'
  | 'reconnect-error'

export function SpoolSessionContinuationNotice({
  phase,
  canControl,
  onRetry
}: {
  phase: Exclude<SpoolSessionPanePhase, 'terminal'>
  canControl: boolean
  onRetry: () => void
}): React.JSX.Element {
  const loading = phase === 'continuing' || phase === 'attaching'
  const waiting = phase === 'waiting-control'
  const closed = phase === 'closed'
  const ended = phase === 'ended'
  const Icon = loading
    ? Loader2
    : waiting
      ? LockKeyhole
      : closed
        ? Play
        : ended
          ? SquareTerminal
          : AlertCircle
  const message = getContinuationMessage(phase, canControl)
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[var(--editor-surface)]/90 p-6">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <Icon
          aria-hidden="true"
          className={
            loading ? 'size-4 animate-spin text-muted-foreground' : 'size-5 text-muted-foreground'
          }
        />
        <p className="text-xs leading-5 text-muted-foreground">{message}</p>
        {phase === 'closed' && canControl ? (
          <Button type="button" size="xs" variant="outline" onClick={onRetry}>
            <Play aria-hidden="true" />
            {translate('auto.components.spool.SpoolSessionPane.continueAgent', 'Continue agent')}
          </Button>
        ) : phase === 'continue-error' ||
          phase === 'attach-error' ||
          phase === 'reconnect-error' ? (
          <Button type="button" size="xs" variant="outline" onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            {phase === 'continue-error'
              ? translate('auto.components.spool.SpoolSessionPane.retryContinue', 'Try again')
              : translate(
                  'auto.components.spool.SpoolSessionPane.retryAttach',
                  'Reconnect terminal'
                )}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function getContinuationMessage(
  phase: Exclude<SpoolSessionPanePhase, 'terminal'>,
  canControl: boolean
): string {
  switch (phase) {
    case 'waiting-control':
      return canControl
        ? translate(
            'auto.components.spool.SpoolSessionPane.startingAfterGrant',
            'Starting the agent on the owner’s desktop…'
          )
        : translate(
            'auto.components.spool.SpoolSessionPane.controlRequired',
            'Request control to continue this agent session on the owner’s desktop.'
          )
    case 'continuing':
      return translate(
        'auto.components.spool.SpoolSessionPane.continuing',
        'Continuing the agent on the owner’s desktop…'
      )
    case 'attaching':
      return translate(
        'auto.components.spool.SpoolSessionPane.attaching',
        'Connecting to the remote terminal…'
      )
    case 'closed':
      return canControl
        ? translate(
            'auto.components.spool.SpoolSessionPane.sessionEnded',
            'This agent session has ended.'
          )
        : translate(
            'auto.components.spool.SpoolSessionPane.controlRequiredAfterClose',
            'Request control to continue this agent session again.'
          )
    case 'ended':
      return translate(
        'auto.components.spool.SpoolSessionPane.terminalEnded',
        'This terminal session has ended.'
      )
    case 'continue-error':
      return translate(
        'auto.components.spool.SpoolSessionPane.continueFailed',
        'Could not continue this agent session.'
      )
    case 'attach-error':
      return translate(
        'auto.components.spool.SpoolSessionPane.attachFailed',
        'The agent started, but its terminal could not be connected.'
      )
    case 'reconnect-error':
      return translate(
        'auto.components.spool.SpoolSessionPane.terminalConnectionLost',
        'The remote terminal connection was lost.'
      )
  }
}
