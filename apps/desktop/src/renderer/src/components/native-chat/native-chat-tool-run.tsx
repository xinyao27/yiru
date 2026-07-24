import { CaretRight as ChevronRight } from '@phosphor-icons/react'
import {
  isToolCallBlock,
  isToolResultBlock,
  type NativeChatBlock
} from '@yiru/workbench-model/agent'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { diffFromText, diffFromToolCall, type DiffLine } from './native-chat-diff'
import { NativeChatDiffView } from './native-chat-diff-view'
import {
  countToolCalls,
  formatToolInput,
  summarizeToolInput,
  summarizeToolRun
} from './native-chat-tool-summary'

const MAX_TOOL_RESULT_CHARS = 4000

/** A single inline tool line — `▸ ToolName  preview` — that expands in place to
 *  show the call's diff/input or the result's body. Tool calls read as flat
 *  lines in the conversation rather than boxed blocks (mobile parity). Lines only
 *  mount while the parent run is open, so each starts expanded (opening the run
 *  reveals every line at once) and is then individually collapsible. */
function ToolLine({ block }: { block: NativeChatBlock }): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(true)

  let name: string
  let preview: string
  let diff: DiffLine[] | null = null
  let body: { output: string; isError?: boolean } | null = null
  // Full, formatted input shown when a diff-less tool call is expanded.
  let detail: string | null = null

  if (isToolCallBlock(block)) {
    name = block.name
    preview = summarizeToolInput(block.input)
    diff = diffFromToolCall(block.name, block.input)
    detail = diff ? null : formatToolInput(block.input)
  } else if (isToolResultBlock(block)) {
    name = translate('components.native-chat.tool.result', 'Result')
    preview = block.output.split('\n')[0]?.slice(0, 80) ?? ''
    diff = diffFromText(block.output)
    body = { output: block.output, isError: block.isError }
  } else {
    return null
  }

  // Only offer expansion when there's more than the inline preview already shows —
  // avoids re-rendering the same truncated string in a box below it.
  const detailAddsInfo = detail !== null && detail.replace(/\s+/g, ' ').trim() !== preview
  const hasDetail = diff !== null || body !== null || detailAddsInfo

  return (
    <div>
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => hasDetail && setExpanded((v) => !v)}
        className={cn(
          'h-auto border-0 justify-start whitespace-normal font-normal focus-visible:bg-accent',
          'group flex w-full gap-1.5 py-0.5 text-left',
          hasDetail ? '' : 'cursor-default'
        )}
      >
        <code className="text-foreground/90 group-hover:text-foreground shrink-0 font-mono text-xs font-semibold transition-colors">
          {name}
        </code>
        {preview ? (
          <span
            className="text-muted-foreground group-hover:text-foreground/70 min-w-0 truncate font-mono text-[11px] transition-colors"
            title={preview}
          >
            {preview}
          </span>
        ) : null}
        {hasDetail ? (
          // Chevron sits on the right; hidden until hover when collapsed, always
          // shown (pointing down) when expanded — mirrors Codex's disclosure affordance.
          <ChevronRight
            weight="regular"
            className={cn(
              'ml-auto size-3.5 shrink-0 text-muted-foreground transition-all',
              expanded ? 'rotate-90 opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          />
        ) : null}
      </Button>
      {hasDetail && expanded ? (
        <div className="space-y-1.5 py-1">
          {diff ? <NativeChatDiffView lines={diff} /> : null}
          {!diff && body ? (
            <pre
              className={cn(
                'max-h-64 overflow-auto whitespace-pre-wrap break-words border border-border bg-card p-2 font-mono text-[11px] leading-[18px] scrollbar-sleek',
                body.isError ? 'text-destructive' : 'text-foreground/80'
              )}
            >
              {body.output.length > MAX_TOOL_RESULT_CHARS
                ? `${body.output.slice(0, MAX_TOOL_RESULT_CHARS)}…`
                : body.output}
            </pre>
          ) : null}
          {!diff && !body && detail ? (
            <pre className="border-border bg-card text-foreground/80 scrollbar-sleek max-h-64 overflow-auto border p-2 font-mono text-[11px] leading-[18px] break-words whitespace-pre-wrap">
              {detail.length > MAX_TOOL_RESULT_CHARS
                ? `${detail.slice(0, MAX_TOOL_RESULT_CHARS)}…`
                : detail}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** A run of a message's tool calls/results, collapsed to a one-line summary that
 *  expands to the individual inline tool lines. `expandSignal` lets the global
 *  toolbar toggle drive every run at once while still allowing per-run override. */
export function NativeChatToolRun({
  blocks,
  expandSignal
}: {
  blocks: NativeChatBlock[]
  /** Toolbar-driven desired open state. Each change re-syncs this run's state. */
  expandSignal: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(expandSignal)
  // Re-sync when the global toolbar toggle flips.
  useEffect(() => setOpen(expandSignal), [expandSignal])

  const callCount = countToolCalls(blocks) || blocks.length
  const summary = summarizeToolRun(blocks)
  const fallbackLabel = translate(
    callCount === 1 ? 'components.native-chat.tool.countOne' : 'components.native-chat.tool.countN',
    callCount === 1 ? '1 tool call' : `${callCount} tool calls`,
    { count: callCount }
  )

  return (
    // Extra top margin sets the tool run apart from the assistant prose above it
    // so the turn's activity doesn't crowd the message text.
    <div className="mt-2">
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group focus-visible:bg-accent flex h-auto w-full justify-start gap-1.5 border-0 py-0.5 text-left font-normal whitespace-normal"
      >
        <span className="text-muted-foreground group-hover:text-foreground/80 shrink-0 font-mono text-[11px] font-bold transition-colors">
          {callCount}×
        </span>
        <span className="text-muted-foreground group-hover:text-foreground/80 min-w-0 truncate font-mono text-[11px] transition-colors">
          {summary || fallbackLabel}
        </span>
        {/* Chevron on the right, revealed on hover when collapsed and pointing
            down when open — matches Codex's tool-run disclosure. */}
        <ChevronRight
          weight="regular"
          className={cn(
            'ml-auto size-3.5 shrink-0 text-muted-foreground transition-all',
            open ? 'rotate-90 opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        />
      </Button>
      {open ? (
        <div className="mt-1">
          {blocks.map((block, i) => (
            <ToolLine key={i} block={block} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
