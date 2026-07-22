/* eslint-disable max-lines -- Why: this animation is a self-contained storyboard; splitting the phase markup from its timing constants would make the sequence harder to verify. */
import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'

import { ClaudeIcon } from '@/components/status-bar/icons'
import { floatingSurfaceClass } from '@/components/ui/floating-surface-styles'
import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { FeatureWallClickRing } from './feature-wall-click-ring'

// Why: this animation tells the full Yiru story end-to-end — the user opens a
// new browser tab, annotates a target on the pricing page, types a change,
// hands off to Claude in a split pane, and Claude edits + verifies the page.
// The DOM and timing track docs/feature-wall-workbench-tile-mock.html so the
// modal stays in lockstep with the design source.

const PROMPT_TEXT = 'Make Starter card stand out'

// Why: hand-rolled tour popovers must obey the same opaque surface contract as
// live dropdowns even though they stay inside the storyboard DOM.
const TOUR_FLOATING_SURFACE_CLASS = floatingSurfaceClass

const PRE_INTRO_MS = 600
const NEWTAB_APPROACH_MS = 700
const NEWTAB_CLICK_MS = 180
const NEWTAB_DWELL_MS = 700
const NEWTAB_ROW_HOVER_MS = 1050
const NEWTAB_ROW_CLICK_MS = 220
const TAB_REVEAL_MS = 500
const APPROACH_CARD_MS = 900
const INSPECT_MS = 700
const ANNOTATE_OPEN_MS = 360
const ANNOTATE_TYPE_INTERVAL_MS = 58
const ANNOTATE_HOLD_MS = 900
const SEND_APPROACH_MS = 500
const SEND_CLICK_MS = 250
const HANDOFF_MS = 200
const WORKING_LINE_STAGGER_MS = 260
const WORKING_HOLD_MS = 1400
const UPDATED_HOLD_MS = 900
const VERIFY_INTENT_MS = 1100
const CLICK_APPROACH_MS = 620
const CLICK_PRESS_MS = 280
const NAVIGATED_HOLD_MS = 700
const SCREENSHOT_LINE_HOLD_MS = 420
const SCREENSHOT_FLASH_HOLD_MS = 700
const VERIFIED_HOLD_MS = 2400
const RESET_HOLD_MS = 300
const CLICK_RING_MS = 460

type Phase =
  | 'idle'
  | 'newtab-approach'
  | 'newtab-click'
  | 'newtab-row-approach'
  | 'newtab-row-click'
  | 'tab-revealed'
  | 'approach-card'
  | 'inspect'
  | 'annotate'
  | 'send-approach'
  | 'send-click'
  | 'handoff'
  | 'working'
  | 'updated'
  | 'verify-intent'
  | 'click-approach'
  | 'click-press'
  | 'navigated'
  | 'screenshot-line'
  | 'screenshot-flash'
  | 'verified'

const PHASE_ORDER: readonly Phase[] = [
  'idle',
  'newtab-approach',
  'newtab-click',
  'newtab-row-approach',
  'newtab-row-click',
  'tab-revealed',
  'approach-card',
  'inspect',
  'annotate',
  'send-approach',
  'send-click',
  'handoff',
  'working',
  'updated',
  'verify-intent',
  'click-approach',
  'click-press',
  'navigated',
  'screenshot-line',
  'screenshot-flash',
  'verified'
]

function phaseAtLeast(current: Phase, target: Phase): boolean {
  return PHASE_ORDER.indexOf(current) >= PHASE_ORDER.indexOf(target)
}

const SPLIT_PHASES: readonly Phase[] = [
  'working',
  'updated',
  'verify-intent',
  'click-approach',
  'click-press',
  'navigated',
  'screenshot-line',
  'screenshot-flash',
  'verified'
]

function isSplitPhase(phase: Phase): boolean {
  return SPLIT_PHASES.includes(phase)
}

type TermEntry =
  | { kind: 'prompt'; text: string }
  | { kind: 'working' }
  | { kind: 'ok'; html: ReactNode }
  | { kind: 'tool'; tool: string; arg: string }
  | { kind: 'tool-muted'; tool: string; muted: string }

const TERM_ENTRIES: readonly { entry: TermEntry; minPhase: Phase }[] = [
  { entry: { kind: 'prompt', text: PROMPT_TEXT }, minPhase: 'working' },
  { entry: { kind: 'working' }, minPhase: 'working' },
  {
    entry: {
      kind: 'ok',
      get html() {
        return (
          <>
            {translate(
              'auto.components.feature.wall.BrowserAnimatedVisual.4fa59ca545',
              '✓ Updated'
            )}{' '}
            <code className="text-emerald-600 dark:text-emerald-400">
              {translate(
                'auto.components.feature.wall.BrowserAnimatedVisual.051c97d15a',
                '.pp-card[data-card="starter"] .pp-cta'
              )}
            </code>
          </>
        )
      }
    },
    minPhase: 'updated'
  },
  {
    entry: {
      kind: 'prompt',
      text: 'Let me click Try free to verify it still works.'
    },
    minPhase: 'verify-intent'
  },
  { entry: { kind: 'tool', tool: 'click', arg: '"Try free"' }, minPhase: 'click-press' },
  {
    entry: { kind: 'tool-muted', tool: 'screenshot', muted: '(capturing page)' },
    minPhase: 'screenshot-line'
  },
  {
    entry: {
      kind: 'ok',
      get html() {
        return (
          <>
            {translate(
              'auto.components.feature.wall.BrowserAnimatedVisual.eb88125c6f',
              '✓ Verified — Try free still works.'
            )}
          </>
        )
      }
    },
    minPhase: 'verified'
  }
]

export function BrowserAnimatedVisual(props: {
  reducedMotion: boolean
  onCycleComplete?: () => void
}): JSX.Element {
  const { reducedMotion, onCycleComplete } = props
  const newBrowserShortcutLabel = useShortcutLabel('tab.newBrowser')

  const [phase, setPhase] = useState<Phase>('idle')
  const [typedChars, setTypedChars] = useState(0)
  const [flashKey, setFlashKey] = useState(0)
  const [clickRingKey, setClickRingKey] = useState(0)
  const [clickRingVisible, setClickRingVisible] = useState(false)
  const [menuOffsetX, setMenuOffsetX] = useState(0)
  const [annotateAnchor, setAnnotateAnchor] = useState<{ left: number; top: number }>({
    left: 116,
    top: 70
  })

  const browserPageRef = useRef<HTMLDivElement | null>(null)
  const titlebarRef = useRef<HTMLDivElement | null>(null)
  const newtabBtnRef = useRef<HTMLSpanElement | null>(null)
  const newtabRowRef = useRef<HTMLDivElement | null>(null)
  const starterCardRef = useRef<HTMLDivElement | null>(null)
  const ctaRef = useRef<HTMLSpanElement | null>(null)
  const sendBtnRef = useRef<HTMLSpanElement | null>(null)
  const cursorPosRef = useRef<{ x: number; y: number }>({ x: 40, y: 18 })
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 40, y: 18 })

  // Why: cursor coordinates are computed against .browser-page so they survive
  // grid reflow when the split lands. We stash both a ref (synchronous read
  // for hover-then-click sequences) and state (for transition animation).
  function setCursorTo(x: number, y: number): void {
    cursorPosRef.current = { x, y }
    setCursorPos({ x, y })
  }

  function transformForElement(
    el: HTMLElement | null,
    offsetX = 0,
    offsetY = 0
  ): { x: number; y: number } {
    const page = browserPageRef.current
    if (!page || !el) {
      return cursorPosRef.current
    }
    const pageRect = page.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    return {
      x: elRect.left - pageRect.left + elRect.width / 2 - 8 + offsetX,
      y: elRect.top - pageRect.top + elRect.height / 2 - 8 + offsetY
    }
  }

  /* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: this
     storyboard effect owns timed local animation state; deriving every phase
     during render would break measured cursor sequencing. */
  useEffect(() => {
    if (reducedMotion) {
      setPhase('verified')
      setTypedChars(PROMPT_TEXT.length)
      setClickRingVisible(false)
      return
    }
    let cancelled = false
    const timeouts: number[] = []
    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        const id = window.setTimeout(() => resolve(), ms)
        timeouts.push(id)
      })
    function pulseClickRing(): void {
      setClickRingKey((key) => key + 1)
      setClickRingVisible(true)
      const id = window.setTimeout(() => {
        if (!cancelled) {
          setClickRingVisible(false)
        }
      }, CLICK_RING_MS)
      timeouts.push(id)
    }

    async function loop(): Promise<void> {
      while (!cancelled) {
        setPhase('idle')
        setTypedChars(0)
        setClickRingVisible(false)
        setCursorTo(40, 18)
        await wait(PRE_INTRO_MS)
        if (cancelled) {
          return
        }

        // 1. Cursor approaches the "+" in the tab strip.
        const newtabPos = transformForElement(newtabBtnRef.current)
        setCursorTo(newtabPos.x, newtabPos.y)
        setPhase('newtab-approach')
        await wait(NEWTAB_APPROACH_MS)
        if (cancelled) {
          return
        }

        // 2. Click "+". Capture the dropdown's left offset relative to the
        // titlebar so the menu lines up with the button.
        setPhase('newtab-click')
        pulseClickRing()
        if (titlebarRef.current && newtabBtnRef.current) {
          const tbRect = titlebarRef.current.getBoundingClientRect()
          const btnRect = newtabBtnRef.current.getBoundingClientRect()
          setMenuOffsetX(btnRect.left - tbRect.left)
        }
        await wait(NEWTAB_CLICK_MS)
        if (cancelled) {
          return
        }
        await wait(NEWTAB_DWELL_MS)
        if (cancelled) {
          return
        }

        // 3. Move to "New Browser Tab" row.
        const rowPos = transformForElement(newtabRowRef.current, 6, 0)
        setCursorTo(rowPos.x, rowPos.y)
        setPhase('newtab-row-approach')
        await wait(NEWTAB_ROW_HOVER_MS)
        if (cancelled) {
          return
        }

        // 4. Click → dropdown closes, browser tab reveals, page comes alive.
        setPhase('newtab-row-click')
        pulseClickRing()
        await wait(NEWTAB_ROW_CLICK_MS)
        if (cancelled) {
          return
        }
        setPhase('tab-revealed')
        await wait(TAB_REVEAL_MS)
        if (cancelled) {
          return
        }

        // Cursor approaches the Starter card.
        const starterPos = transformForElement(starterCardRef.current, 0, -8)
        setCursorTo(starterPos.x, starterPos.y)
        setPhase('approach-card')
        await wait(APPROACH_CARD_MS)
        if (cancelled) {
          return
        }

        setPhase('inspect')
        pulseClickRing()
        await wait(INSPECT_MS)
        if (cancelled) {
          return
        }

        // Anchor the annotate popover to the Starter card's actual position so
        // it lines up regardless of how the parent grid lays out.
        if (browserPageRef.current && starterCardRef.current) {
          const pageRect = browserPageRef.current.getBoundingClientRect()
          const cardRect = starterCardRef.current.getBoundingClientRect()
          setAnnotateAnchor({
            left: cardRect.right - pageRect.left + 6,
            top: cardRect.top - pageRect.top
          })
        }
        setPhase('annotate')
        await wait(ANNOTATE_OPEN_MS)
        if (cancelled) {
          return
        }
        for (let i = 1; i <= PROMPT_TEXT.length; i += 1) {
          if (cancelled) {
            return
          }
          setTypedChars(i)
          await wait(ANNOTATE_TYPE_INTERVAL_MS)
        }
        await wait(ANNOTATE_HOLD_MS)
        if (cancelled) {
          return
        }

        const sendPos = transformForElement(sendBtnRef.current)
        setCursorTo(sendPos.x, sendPos.y)
        setPhase('send-approach')
        await wait(SEND_APPROACH_MS)
        if (cancelled) {
          return
        }

        setPhase('send-click')
        pulseClickRing()
        await wait(SEND_CLICK_MS)
        if (cancelled) {
          return
        }

        setPhase('handoff')
        await wait(HANDOFF_MS)
        if (cancelled) {
          return
        }

        // Split lands. Working line + prompt are gated on phase >= 'working';
        // small stagger keeps them from popping in simultaneously.
        setPhase('working')
        await wait(WORKING_LINE_STAGGER_MS * 2)
        if (cancelled) {
          return
        }
        await wait(WORKING_HOLD_MS)
        if (cancelled) {
          return
        }

        setPhase('updated')
        await wait(UPDATED_HOLD_MS)
        if (cancelled) {
          return
        }

        setPhase('verify-intent')
        await wait(VERIFY_INTENT_MS)
        if (cancelled) {
          return
        }

        const ctaPos = transformForElement(ctaRef.current)
        setCursorTo(ctaPos.x, ctaPos.y)
        setPhase('click-approach')
        await wait(CLICK_APPROACH_MS)
        if (cancelled) {
          return
        }

        setPhase('click-press')
        pulseClickRing()
        await wait(CLICK_PRESS_MS)
        if (cancelled) {
          return
        }

        setPhase('navigated')
        await wait(NAVIGATED_HOLD_MS)
        if (cancelled) {
          return
        }

        setPhase('screenshot-line')
        await wait(SCREENSHOT_LINE_HOLD_MS)
        if (cancelled) {
          return
        }

        setPhase('screenshot-flash')
        setFlashKey((k) => k + 1)
        await wait(SCREENSHOT_FLASH_HOLD_MS)
        if (cancelled) {
          return
        }

        setPhase('verified')
        await wait(VERIFIED_HOLD_MS)
        if (cancelled) {
          return
        }
        onCycleComplete?.()

        await wait(RESET_HOLD_MS)
      }
    }

    loop()
    return () => {
      cancelled = true
      timeouts.forEach((id) => window.clearTimeout(id))
    }
  }, [onCycleComplete, reducedMotion])
  /* oxlint-enable react-doctor/no-adjust-state-on-prop-change */

  const isIntroPhase =
    phase === 'idle' ||
    phase === 'newtab-approach' ||
    phase === 'newtab-click' ||
    phase === 'newtab-row-approach' ||
    phase === 'newtab-row-click'
  const browserChromeVisible = !isIntroPhase
  const browserTabVisible = !isIntroPhase
  const terminalTabMinimized = !isIntroPhase
  const newtabActive = phase === 'newtab-click' || phase === 'newtab-row-approach'
  const newtabRowActive = phase === 'newtab-row-approach'
  const dropdownVisible =
    phase === 'newtab-click' || phase === 'newtab-row-approach' || phase === 'newtab-row-click'
  const cursorVisible = (phase !== 'idle' && phase !== 'navigated') || clickRingVisible
  const ringStarter =
    phase === 'inspect' ||
    phase === 'annotate' ||
    phase === 'send-approach' ||
    phase === 'send-click' ||
    phase === 'handoff'
  const annotateOpen = phase === 'annotate' || phase === 'send-approach' || phase === 'send-click'
  const sendPressed = phase === 'send-click'
  const isSplit = isSplitPhase(phase)
  const ctaHighlighted = phaseAtLeast(phase, 'updated')
  const ctaPressing = phase === 'click-press'
  const showSignup =
    phase === 'navigated' ||
    phase === 'screenshot-line' ||
    phase === 'screenshot-flash' ||
    phase === 'verified'
  const flashing = phase === 'screenshot-flash'
  // While the cursor is acting on the titlebar / dropdown, let the cursor
  // overflow the body's clipping bounds. Once the page is live we re-clip so
  // the cursor never escapes the browser body.
  const bodyOverflowVisible = isIntroPhase

  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-full" style={{ height: 270 }}>
        <div
          className="absolute inset-0 grid transition-[grid-template-columns,gap] duration-500 ease-out"
          style={{
            gridTemplateColumns: isSplit ? '1fr 1fr' : '1fr 0fr',
            gap: isSplit ? 10 : 0
          }}
        >
          {/* Browser app-window — column 1 */}
          <div className="border-border bg-card text-card-foreground relative flex min-w-0 flex-col overflow-hidden rounded-xl border">
            <div
              ref={titlebarRef}
              className="border-border bg-muted/40 relative flex min-h-[32px] items-end gap-1.5 border-b px-2.5 pt-2"
            >
              <div className="ml-1 flex flex-1 items-end gap-1 overflow-visible">
                <BrowserTab
                  minimized={terminalTabMinimized}
                  icon={<TerminalGlyph />}
                  title={translate(
                    'auto.components.feature.wall.BrowserAnimatedVisual.04096318ab',
                    'Terminal 1'
                  )}
                />
                {browserTabVisible ? (
                  <BrowserTab
                    incoming
                    icon={<GlobeGlyph />}
                    title={translate(
                      'auto.components.feature.wall.BrowserAnimatedVisual.7da6eed7bf',
                      'localhost:3000'
                    )}
                  />
                ) : null}
                <span
                  ref={newtabBtnRef}
                  className={cn(
                    'mb-1 inline-flex size-[22px] items-center justify-center rounded-md text-muted-foreground transition-colors duration-150',
                    newtabActive ? 'bg-foreground/10 text-foreground' : null
                  )}
                >
                  <PlusGlyph />
                </span>
              </div>
              {/* New-tab dropdown menu */}
              <div
                aria-hidden={!dropdownVisible}
                className={cn(
                  'absolute z-40 origin-top-left rounded-[10px] p-1 text-[11.5px] transition-[opacity,transform] duration-150',
                  TOUR_FLOATING_SURFACE_CLASS,
                  dropdownVisible
                    ? 'translate-y-0 scale-100 opacity-100'
                    : '-translate-y-[3px] scale-[0.985] opacity-0'
                )}
                style={{
                  top: 'calc(100% + 4px)',
                  left: menuOffsetX,
                  minWidth: 196
                }}
              >
                <DropdownSkeletonRow widthPct={64} />
                <div
                  ref={newtabRowRef}
                  className={cn(
                    'grid items-center gap-2 rounded-md px-2 py-[5px]',
                    newtabRowActive ? 'bg-black/8 dark:bg-white/14' : null
                  )}
                  style={{ gridTemplateColumns: '18px 1fr' }}
                >
                  <span className="text-popover-foreground inline-flex size-[13px] items-center justify-center">
                    <GlobeGlyph />
                  </span>
                  <span className="text-popover-foreground text-[11.5px]">
                    {translate(
                      'auto.components.feature.wall.BrowserAnimatedVisual.0a2bd01c02',
                      'New Browser Tab'
                    )}
                  </span>
                  <span className="text-muted-foreground font-mono text-[10.5px]">
                    {newBrowserShortcutLabel}
                  </span>
                </div>
                <DropdownSkeletonRow widthPct={52} />
              </div>
            </div>

            {/* URL toolbar — hidden until tab reveals so the panel reads as
                "tab created → page came alive" instead of a static frame. */}
            <div
              className="border-border bg-muted/20 flex items-center gap-2 border-b px-2.5 py-1.5"
              style={{ visibility: browserChromeVisible ? 'visible' : 'hidden' }}
            >
              <span className="text-muted-foreground inline-flex gap-1">
                <NavGlyph>‹</NavGlyph>
                <NavGlyph>›</NavGlyph>
                <NavGlyph>↻</NavGlyph>
              </span>
              <div className="border-border bg-card flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-md border px-2 py-[3px] font-mono text-[11px]">
                {isSplit ? (
                  <span className="text-muted-foreground truncate transition-colors duration-200">
                    {`...${showSignup ? '/signup' : '/pricing'}`}
                  </span>
                ) : (
                  <>
                    <span className="text-foreground truncate">
                      {translate(
                        'auto.components.feature.wall.BrowserAnimatedVisual.7da6eed7bf',
                        'localhost:3000'
                      )}
                    </span>
                    <span className="text-muted-foreground truncate transition-colors duration-200">
                      {showSignup
                        ? translate(
                            'auto.components.feature.wall.BrowserAnimatedVisual.f39be6ca14',
                            '/signup'
                          )
                        : translate(
                            'auto.components.feature.wall.BrowserAnimatedVisual.73bbb46073',
                            '/pricing'
                          )}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Browser body — relative + overflow-{hidden|visible} so the
                cursor can escape during the new-tab intro to reach the
                titlebar's "+" / dropdown rows. */}
            <div
              className="bg-card relative flex-1"
              style={{
                overflow: bodyOverflowVisible ? 'visible' : 'hidden',
                minHeight: 0
              }}
            >
              <div
                ref={browserPageRef}
                className="relative flex flex-col gap-3 px-5 py-4"
                style={{ visibility: browserChromeVisible ? 'visible' : 'hidden' }}
              >
                {showSignup ? (
                  <SignupView />
                ) : (
                  <PricingView
                    cardRef={starterCardRef}
                    ctaRef={ctaRef}
                    ringStarter={ringStarter}
                    ctaHighlighted={ctaHighlighted}
                    ctaPressing={ctaPressing}
                  />
                )}

                <div
                  aria-hidden={!annotateOpen}
                  className={cn(
                    'pointer-events-none absolute z-30 flex origin-top-left flex-col gap-1.5 rounded-md px-[9px] pb-[7px] pt-2 text-[10px] transition-[opacity,transform] duration-200',
                    TOUR_FLOATING_SURFACE_CLASS,
                    annotateOpen ? 'scale-100 opacity-100' : 'scale-[0.96] opacity-0'
                  )}
                  style={{ left: annotateAnchor.left, top: annotateAnchor.top, width: 188 }}
                >
                  <span className="text-muted-foreground block w-full shrink-0 truncate font-mono text-[9.5px] leading-none">
                    {translate(
                      'auto.components.feature.wall.BrowserAnimatedVisual.d8856b604a',
                      'div.pricing-grid > div.card.starter:nth-of-type(1) > a.cta'
                    )}
                  </span>
                  <span aria-hidden className="bg-popover-foreground/10 h-px w-full shrink-0" />
                  <div className="text-popover-foreground min-h-[28px] flex-1 font-sans text-[10px] leading-[1.35] break-words">
                    {typedChars > 0 ? (
                      <>
                        {PROMPT_TEXT.slice(0, typedChars)}
                        <span className="bg-popover-foreground ml-px inline-block h-2 w-px translate-y-[1px] align-baseline" />
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        {translate(
                          'auto.components.feature.wall.BrowserAnimatedVisual.3d2352f94b',
                          'Describe the change…'
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <span
                      ref={sendBtnRef}
                      aria-label={translate(
                        'auto.components.feature.wall.BrowserAnimatedVisual.0f8481e1a7',
                        'Send to Claude'
                      )}
                      className={cn(
                        'inline-flex size-5 shrink-0 items-center justify-center rounded border border-border bg-muted text-foreground transition-[background-color,transform] duration-150',
                        sendPressed ? 'scale-[0.92] bg-foreground/[0.12]' : null
                      )}
                    >
                      <ClaudeIcon size={12} />
                    </span>
                  </div>
                </div>

                <span
                  key={flashKey}
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute inset-0 z-40 bg-background/85 dark:bg-foreground/12',
                    flashing ? 'animate-[browserFlash_360ms_ease-out_forwards]' : 'opacity-0'
                  )}
                />
              </div>
              <div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute left-0 top-0 z-50 transition-[opacity,transform] duration-700 ease-[cubic-bezier(.45,.05,.2,1)]',
                  cursorVisible ? 'opacity-100' : 'opacity-0'
                )}
                style={{ transform: `translate(${cursorPos.x}px, ${cursorPos.y}px)` }}
              >
                <div className="relative">
                  <CursorIcon />
                  {clickRingVisible ? <FeatureWallClickRing key={clickRingKey} /> : null}
                </div>
              </div>
            </div>
          </div>

          <div
            className={cn(
              'flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card font-mono text-[10px] text-card-foreground transition-[opacity,transform] duration-500',
              isSplit ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0'
            )}
          >
            <div className="border-border bg-muted/40 text-foreground flex h-5 shrink-0 items-center gap-1.5 border-b px-2 text-[9.5px] font-medium">
              <ClaudeIcon size={11} />
              <span>
                {translate(
                  'auto.components.feature.wall.BrowserAnimatedVisual.6e4616d039',
                  'Claude'
                )}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1 px-2 py-2 leading-snug">
              {TERM_ENTRIES.map(({ entry, minPhase }, i) => (
                <TerminalLine key={i} visible={phaseAtLeast(phase, minPhase)}>
                  <TermEntryView entry={entry} />
                </TerminalLine>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style>
        {translate(
          'auto.components.feature.wall.BrowserAnimatedVisual.1bec24acc1',
          '@keyframes browserFlash { 0% { opacity: 0; } 20% { opacity: 0.85; } 100% { opacity: 0; } } @keyframes browserTabIn { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } } @keyframes browserViewIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }'
        )}
      </style>
    </div>
  )
}

function BrowserTab(props: {
  icon: ReactNode
  title: string
  minimized?: boolean
  incoming?: boolean
}): JSX.Element {
  const { icon, title, minimized, incoming } = props
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 border-border bg-card px-2.5 pb-1.5 pt-1 text-[11px] text-foreground',
        minimized ? 'gap-0 px-2' : null,
        incoming ? 'animate-[browserTabIn_320ms_cubic-bezier(.2,.8,.2,1)_both]' : null
      )}
      style={{ top: 1 }}
    >
      <span className="text-muted-foreground inline-flex size-3 items-center justify-center">
        {icon}
      </span>
      {minimized ? null : (
        <span className="text-foreground text-[11px] whitespace-nowrap">{title}</span>
      )}
    </span>
  )
}

function DropdownSkeletonRow(props: { widthPct: number }): JSX.Element {
  return (
    <div
      className="grid items-center gap-2 rounded-md px-2 py-[5px]"
      style={{ gridTemplateColumns: '18px 1fr' }}
    >
      <span className="bg-popover-foreground/10 size-[13px] rounded-[3px]" />
      <span
        className="bg-popover-foreground/10 h-[7px] rounded-[3px]"
        style={{ width: `${props.widthPct}%` }}
      />
    </div>
  )
}

function TermEntryView(props: { entry: TermEntry }): JSX.Element {
  const { entry } = props
  if (entry.kind === 'prompt') {
    return (
      <span className="text-card-foreground">
        <span className="text-muted-foreground">
          {translate('auto.components.feature.wall.BrowserAnimatedVisual.f2034c4930', '>')}
        </span>{' '}
        {entry.text}
      </span>
    )
  }
  if (entry.kind === 'working') {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500 dark:bg-emerald-400" />
        {translate('auto.components.feature.wall.BrowserAnimatedVisual.0ce7c24b4d', 'Working…')}
      </span>
    )
  }
  if (entry.kind === 'ok') {
    return <span className="text-emerald-600 dark:text-emerald-400">{entry.html}</span>
  }
  if (entry.kind === 'tool') {
    return (
      <span>
        <span className="text-violet-600 dark:text-violet-400">{entry.tool}</span>{' '}
        <span className="text-emerald-600 dark:text-emerald-400">{entry.arg}</span>
      </span>
    )
  }
  return (
    <span>
      <span className="text-violet-600 dark:text-violet-400">{entry.tool}</span>{' '}
      <span className="text-muted-foreground">{entry.muted}</span>
    </span>
  )
}

function TerminalLine(props: { visible: boolean; children: ReactNode }): JSX.Element {
  return (
    <span
      className={cn('transition-opacity duration-300', props.visible ? 'opacity-100' : 'opacity-0')}
    >
      {props.children}
    </span>
  )
}

function PricingView(props: {
  cardRef: React.RefObject<HTMLDivElement | null>
  ctaRef: React.RefObject<HTMLSpanElement | null>
  ringStarter: boolean
  ctaHighlighted: boolean
  ctaPressing: boolean
}): JSX.Element {
  return (
    <>
      <div className="text-[15px] leading-tight font-bold">
        {translate('auto.components.feature.wall.BrowserAnimatedVisual.9e0f530390', 'Pricing')}
      </div>
      <div className="bg-foreground/10 h-2 w-4/5 rounded" />
      <div className="mt-1 grid grid-cols-2 gap-2.5">
        <PricingCard
          cardRef={props.cardRef}
          ctaRef={props.ctaRef}
          label={translate(
            'auto.components.feature.wall.BrowserAnimatedVisual.59ae327405',
            'Starter'
          )}
          cta="Try free"
          target
          ringActive={props.ringStarter}
          ctaHighlighted={props.ctaHighlighted}
          ctaPressing={props.ctaPressing}
        />
        <PricingCard
          label={translate('auto.components.feature.wall.BrowserAnimatedVisual.25f15c2219', 'Pro')}
          cta="Get Pro"
          highlighted
        />
      </div>
    </>
  )
}

function SignupView(): JSX.Element {
  return (
    <div className="flex animate-[browserViewIn_360ms_cubic-bezier(.2,.8,.2,1)_both] flex-col gap-3">
      <div className="text-[15px] leading-tight font-bold">
        {translate(
          'auto.components.feature.wall.BrowserAnimatedVisual.46df009982',
          'Start your free trial'
        )}
      </div>
      <div className="bg-foreground/10 h-2 w-[70%] rounded" />
      <div className="bg-foreground/10 -mt-1 h-2 w-[55%] rounded" />
    </div>
  )
}

function PricingCard(props: {
  label: string
  cta: string
  highlighted?: boolean
  target?: boolean
  ringActive?: boolean
  ctaHighlighted?: boolean
  ctaPressing?: boolean
  cardRef?: React.RefObject<HTMLDivElement | null>
  ctaRef?: React.RefObject<HTMLSpanElement | null>
}): JSX.Element {
  const {
    label,
    cta,
    highlighted,
    target,
    ringActive,
    ctaHighlighted,
    ctaPressing,
    cardRef,
    ctaRef
  } = props
  const ctaIsBranded = ctaHighlighted && !highlighted
  return (
    <div
      ref={cardRef}
      className="border-border bg-card relative flex flex-col gap-1.5 rounded-md border p-2.5"
    >
      {target ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute -inset-[3px] rounded-[10px] border-2 border-blue-500 bg-blue-500/10 transition-opacity duration-300',
            ringActive ? 'opacity-100' : 'opacity-0'
          )}
        />
      ) : null}
      <span className="text-[11.5px] font-semibold">{label}</span>
      <div className="bg-foreground/10 h-1.5 w-3/5 rounded" />
      <div className="bg-foreground/10 h-1.5 w-4/5 rounded" />
      <span
        ref={ctaRef}
        className={cn(
          'mt-1 inline-flex w-fit items-center rounded-md px-2 py-1 text-[11px] font-semibold transition-[background-color,color,transform] duration-300',
          highlighted
            ? 'bg-foreground text-background'
            : ctaIsBranded
              ? 'bg-blue-600 text-white'
              : 'bg-foreground/[0.07] text-foreground',
          ctaPressing ? 'scale-[0.96]' : null
        )}
      >
        {cta}
      </span>
    </div>
  )
}

function NavGlyph(props: { children: ReactNode }): JSX.Element {
  return (
    <span className="text-muted-foreground inline-flex size-[18px] items-center justify-center rounded">
      {props.children}
    </span>
  )
}

function PlusGlyph(): JSX.Element {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

function TerminalGlyph(): JSX.Element {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m4 6 2.5 2L4 10" />
      <path d="M8.5 11h3.5" />
    </svg>
  )
}

function GlobeGlyph(): JSX.Element {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      aria-hidden
    >
      <circle cx={8} cy={8} r={5.5} />
      <path d="M2.5 8h11M8 2.5c2 1.7 2 9.3 0 11M8 2.5c-2 1.7-2 9.3 0 11" />
    </svg>
  )
}

function CursorIcon(): JSX.Element {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden focusable="false">
      <path
        d="M2 1.5 L2 12 L5 9 L7.2 14.5 L9.5 13.6 L7.3 8 L11.5 8 Z"
        fill="#fff"
        stroke="#18181b"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  )
}
