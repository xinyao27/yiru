import { useEffect, useRef, useState } from 'react'

import type { BrowserStoryboard, BrowserStoryboardElements } from './browser-storyboard-state'
import {
  BROWSER_STORYBOARD_MS,
  BROWSER_STORYBOARD_PROMPT,
  browserPhaseAtLeast,
  isBrowserSplitPhase,
  type BrowserStoryboardPhase
} from './browser-storyboard-timeline'

type Point = { x: number; y: number }

export function useBrowserStoryboard(
  reducedMotion: boolean,
  onCycleComplete: (() => void) | undefined,
  elements: BrowserStoryboardElements
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

  useEffect(() => {
    if (reducedMotion) {
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
      const page = elements.browserPage
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

        setCursorTo(elementPoint(elements.newtabButton))
        if (!(await advance('newtab-approach', BROWSER_STORYBOARD_MS.newtabApproach))) {
          return
        }

        setPhase('newtab-click')
        pulseClickRing()
        if (elements.titlebar && elements.newtabButton) {
          const titlebarRect = elements.titlebar.getBoundingClientRect()
          const buttonRect = elements.newtabButton.getBoundingClientRect()
          setMenuOffsetX(buttonRect.left - titlebarRect.left)
        }
        if (!(await wait(BROWSER_STORYBOARD_MS.newtabClick))) {
          return
        }
        if (!(await wait(BROWSER_STORYBOARD_MS.newtabDwell))) {
          return
        }

        setCursorTo(elementPoint(elements.newtabRow, 6))
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

        setCursorTo(elementPoint(elements.starterCard, 0, -8))
        if (!(await advance('approach-card', BROWSER_STORYBOARD_MS.approachCard))) {
          return
        }
        setPhase('inspect')
        pulseClickRing()
        if (!(await wait(BROWSER_STORYBOARD_MS.inspect))) {
          return
        }

        if (elements.browserPage && elements.starterCard) {
          const pageRect = elements.browserPage.getBoundingClientRect()
          const cardRect = elements.starterCard.getBoundingClientRect()
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

        setCursorTo(elementPoint(elements.sendButton))
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

        setCursorTo(elementPoint(elements.cta))
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
  }, [elements, onCycleComplete, reducedMotion])

  const renderedPhase = reducedMotion ? 'verified' : phase
  const isIntroPhase =
    renderedPhase === 'idle' ||
    renderedPhase === 'newtab-approach' ||
    renderedPhase === 'newtab-click' ||
    renderedPhase === 'newtab-row-approach' ||
    renderedPhase === 'newtab-row-click'
  return {
    phase: renderedPhase,
    typedChars: reducedMotion ? BROWSER_STORYBOARD_PROMPT.length : typedChars,
    flashKey,
    clickRingKey,
    clickRingVisible: reducedMotion ? false : clickRingVisible,
    menuOffsetX,
    annotateAnchor,
    cursorPos,
    browserChromeVisible: !isIntroPhase,
    browserTabVisible: !isIntroPhase,
    terminalTabMinimized: !isIntroPhase,
    newtabActive: renderedPhase === 'newtab-click' || renderedPhase === 'newtab-row-approach',
    newtabRowActive: renderedPhase === 'newtab-row-approach',
    dropdownVisible:
      renderedPhase === 'newtab-click' ||
      renderedPhase === 'newtab-row-approach' ||
      renderedPhase === 'newtab-row-click',
    cursorVisible: (renderedPhase !== 'idle' && renderedPhase !== 'navigated') || clickRingVisible,
    ringStarter:
      renderedPhase === 'inspect' ||
      renderedPhase === 'annotate' ||
      renderedPhase === 'send-approach' ||
      renderedPhase === 'send-click' ||
      renderedPhase === 'handoff',
    annotateOpen:
      renderedPhase === 'annotate' ||
      renderedPhase === 'send-approach' ||
      renderedPhase === 'send-click',
    sendPressed: renderedPhase === 'send-click',
    isSplit: isBrowserSplitPhase(renderedPhase),
    ctaHighlighted: browserPhaseAtLeast(renderedPhase, 'updated'),
    ctaPressing: renderedPhase === 'click-press',
    showSignup:
      renderedPhase === 'navigated' ||
      renderedPhase === 'screenshot-line' ||
      renderedPhase === 'screenshot-flash' ||
      renderedPhase === 'verified',
    flashing: renderedPhase === 'screenshot-flash',
    bodyOverflowVisible: isIntroPhase
  }
}
