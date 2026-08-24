import { useEffect, useRef, useState, type RefObject } from 'react'

import {
  BROWSER_STORYBOARD_MS,
  BROWSER_STORYBOARD_PROMPT,
  browserPhaseAtLeast,
  isBrowserSplitPhase,
  type BrowserStoryboardPhase
} from './browser-storyboard-timeline'

type Point = { x: number; y: number }

export type BrowserStoryboard = {
  phase: BrowserStoryboardPhase
  typedChars: number
  flashKey: number
  clickRingKey: number
  clickRingVisible: boolean
  menuOffsetX: number
  annotateAnchor: { left: number; top: number }
  cursorPos: Point
  browserPageRef: RefObject<HTMLDivElement | null>
  titlebarRef: RefObject<HTMLDivElement | null>
  newtabBtnRef: RefObject<HTMLSpanElement | null>
  newtabRowRef: RefObject<HTMLDivElement | null>
  starterCardRef: RefObject<HTMLDivElement | null>
  ctaRef: RefObject<HTMLSpanElement | null>
  sendBtnRef: RefObject<HTMLSpanElement | null>
  browserChromeVisible: boolean
  browserTabVisible: boolean
  terminalTabMinimized: boolean
  newtabActive: boolean
  newtabRowActive: boolean
  dropdownVisible: boolean
  cursorVisible: boolean
  ringStarter: boolean
  annotateOpen: boolean
  sendPressed: boolean
  isSplit: boolean
  ctaHighlighted: boolean
  ctaPressing: boolean
  showSignup: boolean
  flashing: boolean
  bodyOverflowVisible: boolean
}

export function useBrowserStoryboard(
  reducedMotion: boolean,
  onCycleComplete: (() => void) | undefined
): BrowserStoryboard {
  const [phase, setPhase] = useState<BrowserStoryboardPhase>('idle')
  const [typedChars, setTypedChars] = useState(0)
  const [flashKey, setFlashKey] = useState(0)
  const [clickRingKey, setClickRingKey] = useState(0)
  const [clickRingVisible, setClickRingVisible] = useState(false)
  const [menuOffsetX, setMenuOffsetX] = useState(0)
  const [annotateAnchor, setAnnotateAnchor] = useState({ left: 116, top: 70 })
  const [cursorPos, setCursorPos] = useState<Point>({ x: 40, y: 18 })
  const cursorPosRef = useRef<Point>({ x: 40, y: 18 })
  const browserPageRef = useRef<HTMLDivElement | null>(null)
  const titlebarRef = useRef<HTMLDivElement | null>(null)
  const newtabBtnRef = useRef<HTMLSpanElement | null>(null)
  const newtabRowRef = useRef<HTMLDivElement | null>(null)
  const starterCardRef = useRef<HTMLDivElement | null>(null)
  const ctaRef = useRef<HTMLSpanElement | null>(null)
  const sendBtnRef = useRef<HTMLSpanElement | null>(null)

  /* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: the
     storyboard synchronizes timed local animation state with motion settings. */
  useEffect(() => {
    if (reducedMotion) {
      setPhase('verified')
      setTypedChars(BROWSER_STORYBOARD_PROMPT.length)
      setClickRingVisible(false)
      return
    }
    let cancelled = false
    const timeouts: number[] = []
    const wait = (ms: number): Promise<boolean> =>
      new Promise((resolve) => {
        const id = window.setTimeout(() => resolve(!cancelled), ms)
        timeouts.push(id)
      })
    const setCursorTo = (point: Point): void => {
      cursorPosRef.current = point
      setCursorPos(point)
    }
    const elementPoint = (element: HTMLElement | null, offsetX = 0, offsetY = 0): Point => {
      const page = browserPageRef.current
      if (!page || !element) {
        return cursorPosRef.current
      }
      const pageRect = page.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()
      return {
        x: elementRect.left - pageRect.left + elementRect.width / 2 - 8 + offsetX,
        y: elementRect.top - pageRect.top + elementRect.height / 2 - 8 + offsetY
      }
    }
    const advance = async (nextPhase: BrowserStoryboardPhase, ms: number): Promise<boolean> => {
      setPhase(nextPhase)
      return wait(ms)
    }
    const pulseClickRing = (): void => {
      setClickRingKey((key) => key + 1)
      setClickRingVisible(true)
      const id = window.setTimeout(() => {
        if (!cancelled) {
          setClickRingVisible(false)
        }
      }, BROWSER_STORYBOARD_MS.clickRing)
      timeouts.push(id)
    }

    const loop = async (): Promise<void> => {
      while (!cancelled) {
        setPhase('idle')
        setTypedChars(0)
        setClickRingVisible(false)
        setCursorTo({ x: 40, y: 18 })
        if (!(await wait(BROWSER_STORYBOARD_MS.preIntro))) {
          return
        }

        setCursorTo(elementPoint(newtabBtnRef.current))
        if (!(await advance('newtab-approach', BROWSER_STORYBOARD_MS.newtabApproach))) {
          return
        }

        setPhase('newtab-click')
        pulseClickRing()
        if (titlebarRef.current && newtabBtnRef.current) {
          const titlebarRect = titlebarRef.current.getBoundingClientRect()
          const buttonRect = newtabBtnRef.current.getBoundingClientRect()
          setMenuOffsetX(buttonRect.left - titlebarRect.left)
        }
        if (!(await wait(BROWSER_STORYBOARD_MS.newtabClick))) {
          return
        }
        if (!(await wait(BROWSER_STORYBOARD_MS.newtabDwell))) {
          return
        }

        setCursorTo(elementPoint(newtabRowRef.current, 6))
        if (!(await advance('newtab-row-approach', BROWSER_STORYBOARD_MS.newtabRowHover))) {
          return
        }
        setPhase('newtab-row-click')
        pulseClickRing()
        if (!(await wait(BROWSER_STORYBOARD_MS.newtabRowClick))) {
          return
        }
        if (!(await advance('tab-revealed', BROWSER_STORYBOARD_MS.tabReveal))) {
          return
        }

        setCursorTo(elementPoint(starterCardRef.current, 0, -8))
        if (!(await advance('approach-card', BROWSER_STORYBOARD_MS.approachCard))) {
          return
        }
        setPhase('inspect')
        pulseClickRing()
        if (!(await wait(BROWSER_STORYBOARD_MS.inspect))) {
          return
        }

        if (browserPageRef.current && starterCardRef.current) {
          const pageRect = browserPageRef.current.getBoundingClientRect()
          const cardRect = starterCardRef.current.getBoundingClientRect()
          setAnnotateAnchor({
            left: cardRect.right - pageRect.left + 6,
            top: cardRect.top - pageRect.top
          })
        }
        if (!(await advance('annotate', BROWSER_STORYBOARD_MS.annotateOpen))) {
          return
        }
        for (let index = 1; index <= BROWSER_STORYBOARD_PROMPT.length; index += 1) {
          if (cancelled) {
            return
          }
          setTypedChars(index)
          if (!(await wait(BROWSER_STORYBOARD_MS.annotateTypeInterval))) {
            return
          }
        }
        if (!(await wait(BROWSER_STORYBOARD_MS.annotateHold))) {
          return
        }

        setCursorTo(elementPoint(sendBtnRef.current))
        if (!(await advance('send-approach', BROWSER_STORYBOARD_MS.sendApproach))) {
          return
        }
        setPhase('send-click')
        pulseClickRing()
        if (!(await wait(BROWSER_STORYBOARD_MS.sendClick))) {
          return
        }
        if (!(await advance('handoff', BROWSER_STORYBOARD_MS.handoff))) {
          return
        }
        if (!(await advance('working', BROWSER_STORYBOARD_MS.workingLineStagger * 2))) {
          return
        }
        if (!(await wait(BROWSER_STORYBOARD_MS.workingHold))) {
          return
        }
        if (!(await advance('updated', BROWSER_STORYBOARD_MS.updatedHold))) {
          return
        }
        if (!(await advance('verify-intent', BROWSER_STORYBOARD_MS.verifyIntent))) {
          return
        }

        setCursorTo(elementPoint(ctaRef.current))
        if (!(await advance('click-approach', BROWSER_STORYBOARD_MS.clickApproach))) {
          return
        }
        setPhase('click-press')
        pulseClickRing()
        if (!(await wait(BROWSER_STORYBOARD_MS.clickPress))) {
          return
        }
        if (!(await advance('navigated', BROWSER_STORYBOARD_MS.navigatedHold))) {
          return
        }
        if (!(await advance('screenshot-line', BROWSER_STORYBOARD_MS.screenshotLineHold))) {
          return
        }
        setPhase('screenshot-flash')
        setFlashKey((key) => key + 1)
        if (!(await wait(BROWSER_STORYBOARD_MS.screenshotFlashHold))) {
          return
        }
        if (!(await advance('verified', BROWSER_STORYBOARD_MS.verifiedHold))) {
          return
        }
        onCycleComplete?.()
        if (!(await wait(BROWSER_STORYBOARD_MS.resetHold))) {
          return
        }
      }
    }

    void loop()
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
  return {
    phase,
    typedChars,
    flashKey,
    clickRingKey,
    clickRingVisible,
    menuOffsetX,
    annotateAnchor,
    cursorPos,
    browserPageRef,
    titlebarRef,
    newtabBtnRef,
    newtabRowRef,
    starterCardRef,
    ctaRef,
    sendBtnRef,
    browserChromeVisible: !isIntroPhase,
    browserTabVisible: !isIntroPhase,
    terminalTabMinimized: !isIntroPhase,
    newtabActive: phase === 'newtab-click' || phase === 'newtab-row-approach',
    newtabRowActive: phase === 'newtab-row-approach',
    dropdownVisible:
      phase === 'newtab-click' || phase === 'newtab-row-approach' || phase === 'newtab-row-click',
    cursorVisible: (phase !== 'idle' && phase !== 'navigated') || clickRingVisible,
    ringStarter:
      phase === 'inspect' ||
      phase === 'annotate' ||
      phase === 'send-approach' ||
      phase === 'send-click' ||
      phase === 'handoff',
    annotateOpen: phase === 'annotate' || phase === 'send-approach' || phase === 'send-click',
    sendPressed: phase === 'send-click',
    isSplit: isBrowserSplitPhase(phase),
    ctaHighlighted: browserPhaseAtLeast(phase, 'updated'),
    ctaPressing: phase === 'click-press',
    showSignup:
      phase === 'navigated' ||
      phase === 'screenshot-line' ||
      phase === 'screenshot-flash' ||
      phase === 'verified',
    flashing: phase === 'screenshot-flash',
    bodyOverflowVisible: isIntroPhase
  }
}
