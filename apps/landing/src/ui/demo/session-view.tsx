import { cn } from 'cnfast'

import { ClaudeSpinner } from './claude-spinner'
import { AGENT_CWD, AGENT_LABEL, AGENT_MODEL, PROMPT } from './state'
import type { DemoState } from './state'

export type SessionViewProps = {
  state: DemoState
  /** The phone renders the same session at a tighter scale. */
  compact?: boolean
}

/**
 * Why: desktop and phone render this one component from one state object, so the
 * two surfaces cannot drift — the mirroring the beat is claiming is structural
 * rather than two scripts kept in step by hand.
 */
export function SessionView({ state, compact = false }: SessionViewProps): React.JSX.Element {
  // Why: size and leading must ship as one class. twMerge treats `text-[13px]`
  // as a font-size utility that may carry its own line-height, so a separate
  // `leading-*` placed before it is dropped — silently, and the line inherits.
  const body = compact ? 'text-[10px]/[1.6]' : 'text-[12.5px]/[1.6]'
  const typed = PROMPT.slice(0, state.promptChars)

  return (
    // Why: a flex item with only min-w-0 shrinks to its content — the desktop
    // pane needs flex-1 to keep filling its column.
    <div className={cn('flex h-full w-full min-w-0 flex-1 flex-col font-mono', body)}>
      <div className={cn('min-h-0 flex-1', compact ? 'p-2' : 'p-3.5')}>
        {/* Why: the card is sized to its content, not the pane — stretched
            across a wide split it stops reading as a terminal banner. The
            legend clears the corner radius and interrupts the top rule. */}
        <div
          className={cn(
            'border-claude/80 relative rounded-[6px] border',
            compact ? 'px-3 py-2.5' : 'max-w-[300px] px-3.5 py-3'
          )}
        >
          {/* Why: left offset is the card's content inset minus the legend's own
              px-1.5 mask padding, so the label's text edge lines up with the
              text beneath it. -translate-y-1/2 centres the span on the rule
              itself, which stays exact whatever the font metrics are. */}
          <span
            className={cn(
              'bg-page text-claude absolute top-0 -translate-y-1/2 px-1.5',
              compact ? 'text-[9px]/[1]' : 'text-[11.5px]/[1]',
              compact ? 'left-1.5' : 'left-2'
            )}
          >
            {AGENT_LABEL}
          </span>
          {/* Why: leading-none makes each line box exactly its font size, so the
              flex gap is the whole gap. With inherited leading plus a margin the
              real spacing was three values stacked, and never the one written. */}
          <div className="flex flex-col gap-[5px]">
            <p className={cn('text-ink', compact ? 'text-[11px]/[1]' : 'text-[13px]/[1]')}>
              {AGENT_MODEL}
            </p>
            <p className={cn('text-faint', compact ? 'text-[9px]/[1]' : 'text-[11.5px]/[1]')}>
              {AGENT_CWD}
            </p>
          </div>
        </div>

        {state.promptChars > 0 ? (
          <p className="text-copy mt-3 break-words">
            <span className="text-claude mr-1.5">›</span>
            {typed}
            {state.promptChars < PROMPT.length ? (
              <span className="caret text-claude">▊</span>
            ) : null}
          </p>
        ) : null}

        {state.working ? (
          <p className="text-ink mt-2.5">
            <ClaudeSpinner className="text-claude mr-1.5 w-3" />
            Fixing issues…{' '}
            <span className="text-faint tabular-nums">
              ({state.elapsedSeconds}s · ↓ {state.tokens.toLocaleString('en-US')} tokens)
            </span>
          </p>
        ) : null}

        {state.checksVisible ? (
          <p className="text-add-ink mt-2">✓ typecheck ✓ lint ✓ build</p>
        ) : null}

        {state.followUp ? (
          <p className="text-copy mt-3 break-words">
            <span className="text-claude mr-1.5">›</span>
            {state.followUp}
          </p>
        ) : null}

        {state.followUpWorking ? (
          <p className="text-ink mt-2.5">
            <ClaudeSpinner className="text-claude mr-1.5 w-3" />
            Cooking…
          </p>
        ) : null}
      </div>

      {/* Composer — the surface being driven from the phone. Why: full-bleed
          rules rather than an inset box, so it reads as the terminal's own
          prompt line. Only a top rule: it is the last element in the pane, so a
          bottom one would double up against the window's own border. */}
      <div
        className={cn(
          'border-hairline flex shrink-0 items-center gap-2 border-t',
          compact ? 'px-2 py-1.5' : 'px-3.5 py-2.5'
        )}
      >
        <span className="text-claude shrink-0">›</span>
        <span className="text-ink min-w-0 flex-1 truncate">
          {state.composerText}
          {state.composerActive ? <span className="caret text-claude">▊</span> : null}
        </span>
      </div>
    </div>
  )
}
