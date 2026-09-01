import { useEffect, useState } from 'react'

import {
  RUN_QUEUE,
  type CursorTarget,
  type Phase,
  type RightLine
} from './workbench-storyboard-types'

// Beat timings — kept in named constants so the loop reads top-to-bottom.
const PRE_HOVER_MS = 450
const HOVER_HOLD_MS = 820
const RIGHT_CLICK_MS = 220
const MENU_SETTLE_MS = 380
const MENU_HOLD_MS = 1420
const MENU_CLICK_MS = 180
const POST_CLICK_MS = 160
const POST_SPLIT_MS = 700
const TYPE_PER_CHAR_MS = 95
const POST_CLAUDE_TYPE_MS = 550
const SESSION_HEADER_MS = 900
const PRE_PROMPT_TYPE_MS = 350
const PROMPT_PER_CHAR_MS = 55
const POST_PROMPT_TYPE_MS = 700
const POST_SUBMIT_MS = 450
const THINKING_MS = 1100
const RESPONSE_GAP_MS = 500
const RESPONSE_GAP_LATER_MS = 550
const FINAL_HOLD_MS = 1800
// Why: the success state of side-by-side agents needs a longer dwell time so the user can easily see both active.
const CHECKLIST_FINAL_HOLD_MS = 3800

const RUN_TICK_MS = 2400

const CLAUDE_CMD = 'claude'
const REVIEW_PROMPT = 'review src/auth for missing error handling'
const CODEX_CMD = 'codex'
const CODEX_PROMPT = 'fix failing checkout test'
const RESPONSE_WIDTHS = [72, 88, 64, 78] as const

function getTwoAgentsReducedMotionLines(): readonly RightLine[] {
  return [
    { kind: 'submitted-command', text: CODEX_CMD },
    { kind: 'session-started' },
    { kind: 'submitted-prompt', text: CODEX_PROMPT },
    { kind: 'agent-action', action: 'Read', target: 'checkout.test.ts' },
    { kind: 'agent-action', action: 'Grep', target: 'timeout checkout' },
    { kind: 'agent-action', action: 'Edit', target: 'src/checkout.ts', working: true }
  ]
}

type WorkbenchStoryboardOptions = {
  reducedMotion: boolean
  isTwoAgentsChecklist: boolean
}

export function useWorkbenchStoryboard(options: WorkbenchStoryboardOptions) {
  const { reducedMotion, isTwoAgentsChecklist } = options

  const [phase, setPhase] = useState<Phase>(() =>
    reducedMotion && isTwoAgentsChecklist ? { kind: 'split-active' } : { kind: 'idle' }
  )
  const [runIdx, setRunIdx] = useState(0)
  const [cursorTarget, setCursorTarget] = useState<CursorTarget>({ kind: 'hidden' })
  const [rightTyped, setRightTyped] = useState('')
  const [rightLines, setRightLines] = useState<readonly RightLine[]>(() =>
    reducedMotion && isTwoAgentsChecklist ? getTwoAgentsReducedMotionLines() : []
  )
  const [showInputLine, setShowInputLine] = useState(!(reducedMotion && isTwoAgentsChecklist))
  const [promptGlyph, setPromptGlyph] = useState<'$' | '>'>('$')
  const [showCaret, setShowCaret] = useState(true)
  const [rippleKey, setRippleKey] = useState(0)

  // Cycle the running test on the left, independent of the loop, so the
  // playwright run keeps moving while the user works on the right.
  useEffect(() => {
    if (reducedMotion || isTwoAgentsChecklist) {
      return
    }
    const id = window.setInterval(() => {
      setRunIdx((i) => (i + 1) % RUN_QUEUE.length)
    }, RUN_TICK_MS)
    return () => window.clearInterval(id)
  }, [isTwoAgentsChecklist, reducedMotion])

  // Main animation loop — async-ish using setTimeout chains so reduced-motion
  // can short-circuit the entire effect cleanly.
  useEffect(() => {
    if (reducedMotion) {
      return
    }
    let cancelled = false
    const timeouts: number[] = []
    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        const id = window.setTimeout(() => resolve(), ms)
        timeouts.push(id)
      })

    async function loop(): Promise<void> {
      while (!cancelled) {
        // 1. Reset state for a fresh cycle.
        setPhase({ kind: 'idle' })
        setCursorTarget({ kind: 'hidden' })
        setRightTyped('')
        setRightLines([])
        setShowInputLine(true)
        setPromptGlyph('$')
        setShowCaret(true)
        await wait(PRE_HOVER_MS)
        if (cancelled) {
          return
        }

        // 2. Cursor enters the left pane.
        setPhase({ kind: 'hover' })
        setCursorTarget({ kind: 'pane' })
        await wait(HOVER_HOLD_MS)
        if (cancelled) {
          return
        }

        // 3. Right-click ripple, then menu opens.
        setPhase({ kind: 'right-click' })
        setRippleKey((k) => k + 1)
        await wait(RIGHT_CLICK_MS)
        if (cancelled) {
          return
        }
        setPhase({ kind: 'menu-open' })
        await wait(MENU_SETTLE_MS)
        if (cancelled) {
          return
        }

        // 4. Cursor parks on the highlighted Split Terminal Right row.
        setPhase({ kind: 'menu-active' })
        setCursorTarget({ kind: 'split-row' })
        await wait(MENU_HOLD_MS)
        if (cancelled) {
          return
        }

        // 5. Click ripple, menu fades, pane splits.
        setPhase({ kind: 'menu-click' })
        setRippleKey((k) => k + 1)
        await wait(MENU_CLICK_MS)
        if (cancelled) {
          return
        }
        setCursorTarget({ kind: 'hidden' })
        await wait(POST_CLICK_MS)
        if (cancelled) {
          return
        }
        setPhase({ kind: 'split-empty' })
        await wait(POST_SPLIT_MS)
        if (cancelled) {
          return
        }

        // 6. User types an agent command into the new pane.
        setPhase({ kind: 'split-active' })
        const agentCommand = isTwoAgentsChecklist ? CODEX_CMD : CLAUDE_CMD
        for (let i = 1; i <= agentCommand.length; i += 1) {
          if (cancelled) {
            return
          }
          setRightTyped(agentCommand.slice(0, i))
          await wait(TYPE_PER_CHAR_MS)
        }
        await wait(POST_CLAUDE_TYPE_MS)
        if (cancelled) {
          return
        }

        // 7. Hide input line, show "session started", then bring input back
        //    with the agent `>` prompt glyph.
        setShowInputLine(false)
        setRightLines((lines) => [
          ...lines,
          { kind: 'submitted-command', text: agentCommand },
          { kind: 'session-started' }
        ])
        await wait(SESSION_HEADER_MS)
        if (cancelled) {
          return
        }
        setShowInputLine(true)
        setPromptGlyph('>')
        setRightTyped('')
        await wait(PRE_PROMPT_TYPE_MS)
        if (cancelled) {
          return
        }

        // 8. Type the task prompt.
        const taskPrompt = isTwoAgentsChecklist ? CODEX_PROMPT : REVIEW_PROMPT
        for (let i = 1; i <= taskPrompt.length; i += 1) {
          if (cancelled) {
            return
          }
          setRightTyped(taskPrompt.slice(0, i))
          await wait(PROMPT_PER_CHAR_MS)
        }
        await wait(POST_PROMPT_TYPE_MS)
        if (cancelled) {
          return
        }

        // 9. Submit: collapse input into scrollback, swap to thinking spinner.
        setShowCaret(false)
        setRightLines((lines) => [...lines, { kind: 'submitted-prompt', text: taskPrompt }])
        setShowInputLine(false)
        await wait(POST_SUBMIT_MS)
        if (cancelled) {
          return
        }
        setRightLines((lines) => [...lines, { kind: 'thinking' }])
        await wait(THINKING_MS)
        if (cancelled) {
          return
        }

        // 10. Stream concrete work for the checklist visual; keep the generic
        // tour abstract so it stays about the split gesture.
        if (isTwoAgentsChecklist) {
          setRightLines((lines) => {
            const withoutThinking = lines.filter((l) => l.kind !== 'thinking')
            return [
              ...withoutThinking,
              { kind: 'agent-action', action: 'Read', target: 'checkout.test.ts' }
            ]
          })
          await wait(RESPONSE_GAP_MS)
          if (cancelled) {
            return
          }
          setRightLines((lines) => [
            ...lines,
            { kind: 'agent-action', action: 'Grep', target: 'timeout checkout' }
          ])
          await wait(RESPONSE_GAP_LATER_MS)
          if (cancelled) {
            return
          }
          setRightLines((lines) => [
            ...lines,
            { kind: 'agent-action', action: 'Edit', target: 'src/checkout.ts', working: true }
          ])
          await wait(CHECKLIST_FINAL_HOLD_MS)
          if (cancelled) {
            return
          }
          continue
        }

        // 10. Stream skeleton response bars — actual answer doesn't matter.
        setRightLines((lines) => {
          const withoutThinking = lines.filter((l) => l.kind !== 'thinking')
          return [
            ...withoutThinking,
            { kind: 'response-skeleton', widthPct: RESPONSE_WIDTHS[0], withGlyph: true }
          ]
        })
        await wait(RESPONSE_GAP_MS)
        if (cancelled) {
          return
        }
        setRightLines((lines) => [
          ...lines,
          { kind: 'response-skeleton', widthPct: RESPONSE_WIDTHS[1], withGlyph: false }
        ])
        await wait(RESPONSE_GAP_LATER_MS)
        if (cancelled) {
          return
        }
        setRightLines((lines) => [
          ...lines,
          { kind: 'response-skeleton', widthPct: RESPONSE_WIDTHS[2], withGlyph: false }
        ])
        await wait(RESPONSE_GAP_LATER_MS)
        if (cancelled) {
          return
        }
        setRightLines((lines) => [
          ...lines,
          { kind: 'response-skeleton', widthPct: RESPONSE_WIDTHS[3], withGlyph: false }
        ])
        await wait(isTwoAgentsChecklist ? CHECKLIST_FINAL_HOLD_MS : FINAL_HOLD_MS)
        if (cancelled) {
          return
        }
      }
    }

    loop()
    return () => {
      cancelled = true
      timeouts.forEach((id) => window.clearTimeout(id))
    }
  }, [isTwoAgentsChecklist, reducedMotion])

  return {
    cursorTarget,
    phase,
    promptGlyph,
    rightLines,
    rightTyped,
    rippleKey,
    runIdx,
    showCaret,
    showInputLine
  }
}
