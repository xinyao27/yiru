import { Code, WarningCircle } from '@phosphor-icons/react'
import { getWorktreePathBasenameFromId } from '@yiru/workbench-model/workspace'
import React, { useEffect, useState, useSyncExternalStore } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import {
  monacoLanguageServerManager,
  type LanguageServerManagerStatus
} from '@/lib/monaco-language-server-manager'
import { useAppStore } from '@/store'

import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './status-bar-context-menu-policy'

type LanguageServerStatusSegmentProps = {
  iconOnly: boolean
}

export function LanguageServerStatusSegment({
  iconOnly
}: LanguageServerStatusSegmentProps): React.JSX.Element {
  const snapshot = useSyncExternalStore(
    monacoLanguageServerManager.subscribe,
    monacoLanguageServerManager.getSnapshot
  )
  const current = snapshot.sessions[0] ?? null
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const setSettingsSearchQuery = useAppStore((state) => state.setSettingsSearchQuery)

  useEffect(() => {
    if (!open || !current) {
      setLogs([])
      return
    }
    let cancelled = false
    setLogsLoading(true)
    void monacoLanguageServerManager
      .getLogs(current.key)
      .then((nextLogs) => {
        if (!cancelled) {
          setLogs(nextLogs)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLogsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [current, open])

  const state = current?.state ?? 'stopped'
  const label = getStatusLabel(state)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
                  className="hover:bg-accent/70 focus-visible:bg-accent/70 inline-flex cursor-pointer items-center gap-1.5 px-1 py-0.5 outline-none"
                  aria-label={translate(
                    'auto.components.status.bar.LanguageServerStatusSegment.aria',
                    'Language server: {{value0}}',
                    { value0: label }
                  )}
                >
                  {state === 'starting' ? (
                    <LoadingIndicator className="text-muted-foreground size-3" />
                  ) : state === 'failed' ? (
                    <WarningCircle className="text-destructive size-3" />
                  ) : (
                    <Code className="text-muted-foreground size-3" />
                  )}
                  {!iconOnly ? (
                    <span className={statusTextClass(state)}>
                      {translate(
                        'auto.components.status.bar.LanguageServerStatusSegment.compactLabel',
                        'LSP: {{value0}}',
                        { value0: label }
                      )}
                    </span>
                  ) : null}
                </button>
              }
            />
          }
        />
        <TooltipContent side="top" sideOffset={6}>
          {translate(
            'auto.components.status.bar.LanguageServerStatusSegment.tooltip',
            'Language server — {{value0}}',
            { value0: label }
          )}
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        initialFocus={false}
        {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
        className="w-[28rem] max-w-[calc(100vw-2rem)] p-0"
      >
        <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
            <Code className="text-muted-foreground size-3.5" />
            <span>
              {translate(
                'auto.components.status.bar.LanguageServerStatusSegment.title',
                'Language Server'
              )}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              setOpen(false)
              openSettingsPage()
              setSettingsSearchQuery('language server')
            }}
          >
            {translate(
              'auto.components.status.bar.LanguageServerStatusSegment.configure',
              'Configure'
            )}
          </Button>
        </div>

        <div className="space-y-3 px-3 py-3">
          {current ? (
            <SessionStatus status={current} />
          ) : (
            <p className="text-muted-foreground text-xs">
              {translate(
                'auto.components.status.bar.LanguageServerStatusSegment.idle',
                'Open a configured source file to start the server on its execution host.'
              )}
            </p>
          )}
          {logsLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <LoadingIndicator className="size-3" />
              {translate(
                'auto.components.status.bar.LanguageServerStatusSegment.loadingLogs',
                'Loading logs…'
              )}
            </div>
          ) : logs.length > 0 ? (
            <pre className="scrollbar-sleek border-border bg-muted text-muted-foreground max-h-48 overflow-auto border p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
              {logs.join('\n')}
            </pre>
          ) : current ? (
            <p className="text-muted-foreground text-[11px]">
              {translate(
                'auto.components.status.bar.LanguageServerStatusSegment.noLogs',
                'No server log output.'
              )}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SessionStatus({ status }: { status: LanguageServerManagerStatus }): React.JSX.Element {
  const workspace = getWorktreePathBasenameFromId(status.worktreeId) ?? status.worktreeId
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="text-foreground truncate font-mono">{workspace}</span>
        <span className={statusTextClass(status.state)}>{getStatusLabel(status.state)}</span>
      </div>
      {status.serverName ? <p className="text-muted-foreground">{status.serverName}</p> : null}
      {status.hostLabel ? <p className="text-muted-foreground">{status.hostLabel}</p> : null}
      {status.message ? <p className="text-destructive break-words">{status.message}</p> : null}
    </div>
  )
}

function getStatusLabel(state: LanguageServerManagerStatus['state']): string {
  if (state === 'starting') {
    return translate('auto.components.status.bar.LanguageServerStatusSegment.starting', 'Starting')
  }
  if (state === 'ready') {
    return translate('auto.components.status.bar.LanguageServerStatusSegment.ready', 'Ready')
  }
  if (state === 'failed') {
    return translate('auto.components.status.bar.LanguageServerStatusSegment.error', 'Error')
  }
  return translate('auto.components.status.bar.LanguageServerStatusSegment.idleLabel', 'Idle')
}

function statusTextClass(state: LanguageServerManagerStatus['state']): string {
  return state === 'failed'
    ? 'text-[11px] font-medium text-destructive'
    : state === 'ready'
      ? 'text-[11px] font-medium text-green-700 dark:text-green-400'
      : 'text-[11px] font-medium text-muted-foreground'
}
