import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ImageIcon, Loader2, Play, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import {
  SPOOL_SESSION_TRANSCRIPT_MAX_BLOCK_CHARS,
  SPOOL_SESSION_TRANSCRIPT_MAX_MESSAGES,
  type SpoolSessionReadResult,
  type SpoolSessionTranscriptBlock,
  type SpoolSessionTranscriptMessage
} from '../../../../shared/spool/spool-operation-contract'
import type { SpoolRequesterTransportErrorCode } from '../../../../shared/spool/spool-ipc-contract'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { selectSpoolCanControl } from '@/store/slices/spool-sharing-selectors'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SpoolTerminalPane } from './SpoolTerminalPane'
import { getSpoolRequesterTransportErrorCode } from './spool-requester-error'
import { isSameSpoolSessionRoute, type SpoolSessionRoute } from './spool-session-route'
import { SpoolMutationOutcomeNotice } from './SpoolMutationOutcomeNotice'

export function SpoolSessionPane({ route }: { route: SpoolSessionRoute }): React.JSX.Element {
  const [mode, setMode] = useState<'terminal' | 'historical'>('terminal')
  const showHistorical = useCallback((code: SpoolRequesterTransportErrorCode) => {
    if (code === 'resource_not_found') {
      setMode('historical')
    }
  }, [])

  if (mode === 'historical') {
    return <SpoolHistoricalSessionPane route={route} onContinued={() => setMode('terminal')} />
  }
  return <SpoolTerminalPane route={route} onSubscriptionError={showHistorical} />
}

function SpoolHistoricalSessionPane({
  route,
  onContinued
}: {
  route: SpoolSessionRoute
  onContinued: () => void
}): React.JSX.Element {
  const canControl = useAppStore((state) => selectSpoolCanControl(state, route))
  const [result, setResult] = useState<SpoolSessionReadResult | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [continuing, setContinuing] = useState(false)
  const [continueOutcomeUnknown, setContinueOutcomeUnknown] = useState(false)
  const [readAttempt, setReadAttempt] = useState(0)

  useEffect(() => {
    let disposed = false
    void window.api.spoolSharing
      .invoke({
        desktopRef: route.desktopRef,
        connectionEpoch: route.connectionEpoch,
        method: 'session.read',
        params: { sessionRef: route.sessionRef }
      })
      .then((value) => {
        if (!disposed && isSpoolSessionReadResult(value)) {
          setResult(value)
          setStatus('ready')
        } else if (!disposed) {
          setStatus('error')
        }
      })
      .catch(() => {
        if (!disposed) {
          setStatus('error')
        }
      })
    return () => {
      disposed = true
    }
  }, [readAttempt, route.connectionEpoch, route.desktopRef, route.sessionRef])

  const continueSession = async (): Promise<void> => {
    if (continuing || !selectSpoolCanControl(useAppStore.getState(), route)) {
      return
    }
    setContinuing(true)
    try {
      await window.api.spoolSharing.invoke({
        desktopRef: route.desktopRef,
        connectionEpoch: route.connectionEpoch,
        method: 'session.continue',
        params: { sessionRef: route.sessionRef }
      })
      onContinued()
    } catch (error) {
      setContinuing(false)
      const activeRoute = useAppStore.getState().activeSpoolWorkspaceRoute
      if (!isSameSpoolSessionRoute(activeRoute, route)) {
        return
      }
      if (getSpoolRequesterTransportErrorCode(error) === 'outcome_unknown') {
        setContinueOutcomeUnknown(true)
        toast.warning(
          translate(
            'auto.components.spool.SpoolSessionPane.continueOutcomeUnknown',
            'Continuing this session may have succeeded on the owner’s desktop. Inspect the session list and terminal before continuing it again.'
          )
        )
        return
      }
      toast.error(
        translate(
          'auto.components.spool.SpoolSessionPane.continueFailed',
          'Could not continue this session.'
        )
      )
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--editor-surface)]">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-3 text-card-foreground">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {translate(
            'auto.components.spool.SpoolSessionPane.transcriptTitle',
            'Session transcript'
          )}
        </span>
        <Button
          type="button"
          size="xs"
          disabled={!canControl || continuing || continueOutcomeUnknown || status !== 'ready'}
          onClick={() => void continueSession()}
        >
          {continuing ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {translate('auto.components.spool.SpoolSessionPane.continue', 'Continue session')}
        </Button>
      </header>
      {continueOutcomeUnknown ? (
        <SpoolMutationOutcomeNotice
          description={translate(
            'auto.components.spool.SpoolSessionPane.continueOutcomeUnknownPersistent',
            'Continuing may have succeeded. Inspect the session list and terminal before continuing again.'
          )}
          onDismiss={() => setContinueOutcomeUnknown(false)}
        />
      ) : null}
      {status === 'loading' ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        </div>
      ) : status === 'error' || !result ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertCircle aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.spool.SpoolSessionPane.transcriptUnavailable',
              'This session transcript is unavailable.'
            )}
          </p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              setStatus('loading')
              setReadAttempt((n) => n + 1)
            }}
          >
            <RotateCcw aria-hidden="true" />
            {translate('auto.components.spool.SpoolSessionPane.retry', 'Retry')}
          </Button>
        </div>
      ) : (
        <TranscriptMessages result={result} />
      )}
    </section>
  )
}

function TranscriptMessages({ result }: { result: SpoolSessionReadResult }): React.JSX.Element {
  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-3">
        {result.truncated ? (
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {translate(
              'auto.components.spool.SpoolSessionPane.transcriptTruncated',
              'Only the most recent part of this transcript is available.'
            )}
          </p>
        ) : null}
        {result.messages.map((message, index) => (
          <TranscriptMessage key={index} message={message} />
        ))}
      </div>
    </div>
  )
}

function TranscriptMessage({
  message
}: {
  message: SpoolSessionTranscriptMessage
}): React.JSX.Element {
  return (
    <article className="rounded-lg border border-border bg-card px-3 py-2.5 text-card-foreground">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {getRoleLabel(message.role)}
      </div>
      <div className="space-y-2">
        {message.blocks.map((block, index) => (
          <TranscriptBlock key={index} block={block} />
        ))}
      </div>
    </article>
  )
}

function TranscriptBlock({ block }: { block: SpoolSessionTranscriptBlock }): React.JSX.Element {
  if (block.type === 'text') {
    return <p className="whitespace-pre-wrap break-words text-sm leading-6">{block.text}</p>
  }
  if (block.type === 'image') {
    return (
      <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
        <ImageIcon aria-hidden="true" className="size-3.5" />
        {block.alt ?? translate('auto.components.spool.SpoolSessionPane.image', 'Image')}
      </div>
    )
  }
  const isError = block.type === 'tool-result' && block.isError
  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/40">
      <div
        className={cn(
          'border-b border-border px-2.5 py-1 text-[11px] font-medium',
          isError ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {block.type === 'tool-call'
          ? block.name
          : translate('auto.components.spool.SpoolSessionPane.toolResult', 'Tool result')}
      </div>
      <pre className="scrollbar-sleek overflow-x-auto whitespace-pre-wrap break-words p-2.5 font-mono text-xs leading-5">
        {block.type === 'tool-call' ? block.input : block.output}
      </pre>
    </div>
  )
}

function getRoleLabel(role: SpoolSessionTranscriptMessage['role']): string {
  switch (role) {
    case 'user':
      return translate('auto.components.spool.SpoolSessionPane.role.user', 'User')
    case 'assistant':
      return translate('auto.components.spool.SpoolSessionPane.role.assistant', 'Assistant')
    case 'tool':
      return translate('auto.components.spool.SpoolSessionPane.role.tool', 'Tool')
    case 'reasoning':
      return translate('auto.components.spool.SpoolSessionPane.role.reasoning', 'Reasoning')
    case 'system':
      return translate('auto.components.spool.SpoolSessionPane.role.system', 'System')
  }
}

function isSpoolSessionReadResult(value: unknown): value is SpoolSessionReadResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const result = value as Partial<SpoolSessionReadResult>
  return (
    typeof result.truncated === 'boolean' &&
    Array.isArray(result.messages) &&
    result.messages.length <= SPOOL_SESSION_TRANSCRIPT_MAX_MESSAGES &&
    result.messages.every(isSpoolTranscriptMessage)
  )
}

function isSpoolTranscriptMessage(value: unknown): value is SpoolSessionTranscriptMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const message = value as Partial<SpoolSessionTranscriptMessage>
  return (
    (message.role === 'user' ||
      message.role === 'assistant' ||
      message.role === 'tool' ||
      message.role === 'reasoning' ||
      message.role === 'system') &&
    (message.timestamp === null ||
      (typeof message.timestamp === 'number' && Number.isFinite(message.timestamp))) &&
    Array.isArray(message.blocks) &&
    message.blocks.length <= 100 &&
    message.blocks.every(isSpoolTranscriptBlock)
  )
}

function isSpoolTranscriptBlock(value: unknown): value is SpoolSessionTranscriptBlock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const block = value as Record<string, unknown>
  if (block.type === 'text') {
    return isBoundedTranscriptText(block.text)
  }
  if (block.type === 'tool-call') {
    return isBoundedTranscriptText(block.name) && isBoundedTranscriptText(block.input)
  }
  if (block.type === 'tool-result') {
    return isBoundedTranscriptText(block.output) && typeof block.isError === 'boolean'
  }
  return block.type === 'image' && (block.alt === null || isBoundedTranscriptText(block.alt))
}

function isBoundedTranscriptText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= SPOOL_SESSION_TRANSCRIPT_MAX_BLOCK_CHARS + 64
}
