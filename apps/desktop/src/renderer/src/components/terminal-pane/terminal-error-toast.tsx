import { X } from '@phosphor-icons/react'
import { YIRU_GITHUB_ISSUES_URL } from '@yiru/workbench-model/product'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
const SSH_PREFIX = 'SSH connection is not active'
const STALE_NODE_PTY_DAEMON_MARKERS = [
  "Daemon's node-pty install is gone",
  'node-pty: posix_spawn failed: ENOENT'
]
const STALE_DAEMON_CWD_MARKERS = [
  "Daemon's working directory is gone",
  'node-pty: daemon_cwd failed: ENOENT'
]

function isSshError(error: string): boolean {
  return error.startsWith(SSH_PREFIX)
}

export function shouldOfferDaemonRestart(error: string): boolean {
  return [STALE_NODE_PTY_DAEMON_MARKERS, STALE_DAEMON_CWD_MARKERS].some((markers) =>
    markers.every((marker) => error.includes(marker))
  )
}

export function TerminalErrorToast({
  error,
  onDismiss,
  onRestartDaemon
}: {
  error: string
  onDismiss: () => void
  onRestartDaemon?: () => void
}): React.JSX.Element {
  const ssh = isSshError(error)
  const showDaemonRestart = !ssh && onRestartDaemon && shouldOfferDaemonRestart(error)
  const dismissLabel = translate('auto.components.ui.dialog.f26c4baeda', 'Close')

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        right: 12,
        zIndex: 50,
        padding: '10px 14px',
        borderRadius: 6,
        background: ssh ? 'rgba(234, 179, 8, 0.12)' : 'rgba(220, 38, 38, 0.15)',
        border: ssh ? '1px solid rgba(234, 179, 8, 0.35)' : '1px solid rgba(220, 38, 38, 0.4)',
        color: ssh ? '#fde68a' : '#fca5a5',
        fontSize: 12,
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        pointerEvents: 'auto'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <span style={{ minWidth: 0 }}>
          {error}
          {showDaemonRestart ? (
            <>
              {'\n'}
              {translate(
                'auto.components.terminal.pane.TerminalErrorToast.cc6d997c65',
                'Restart the terminal daemon from here to clear stale daemon state.'
              )}
            </>
          ) : !ssh ? (
            <>
              {'\n'}
              {translate(
                'auto.components.terminal.pane.TerminalErrorToast.5c8ce20be6',
                'If this persists, please'
              )}{' '}
              <a
                href={YIRU_GITHUB_ISSUES_URL}
                style={{ color: '#fca5a5', textDecoration: 'underline' }}
                className="focus-visible:bg-accent outline-none"
              >
                {translate(
                  'auto.components.terminal.pane.TerminalErrorToast.a7e2fd2699',
                  'file an issue'
                )}
              </a>
              .
            </>
          ) : null}
        </span>
        {showDaemonRestart ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={onRestartDaemon}
            style={{
              marginLeft: 12,
              border: '1px solid rgba(252, 165, 165, 0.45)',
              borderRadius: 6,
              background: 'rgba(127, 29, 29, 0.35)',
              color: '#fecaca',
              cursor: 'pointer',
              fontSize: 12,
              padding: '4px 8px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
            className="focus-visible:bg-accent h-auto border-0 p-0"
          >
            {translate(
              'auto.components.terminal.pane.TerminalErrorToast.e4aa243f8c',
              'Restart daemon'
            )}
          </Button>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="xs"
                onClick={onDismiss}
                aria-label={dismissLabel}
                style={{
                  background: 'none',
                  border: 'none',
                  color: ssh ? '#fde68a' : '#fca5a5',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '0 0 0 8px',
                  lineHeight: 1,
                  flexShrink: 0
                }}
                className="focus-visible:bg-accent h-auto border-0 p-0"
              >
                <X weight="regular" className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent side="top" sideOffset={4}>
            {dismissLabel}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
