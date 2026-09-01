import type { BrowserStoryboardPhase } from './browser-storyboard-timeline'

type Point = { x: number; y: number }

export type BrowserStoryboard = {
  annotateAnchor: { left: number; top: number }
  annotateOpen: boolean
  bodyOverflowVisible: boolean
  browserChromeVisible: boolean
  browserTabVisible: boolean
  clickRingKey: number
  clickRingVisible: boolean
  ctaHighlighted: boolean
  ctaPressing: boolean
  cursorPos: Point
  cursorVisible: boolean
  dropdownVisible: boolean
  flashKey: number
  flashing: boolean
  isSplit: boolean
  menuOffsetX: number
  newtabActive: boolean
  newtabRowActive: boolean
  phase: BrowserStoryboardPhase
  ringStarter: boolean
  sendPressed: boolean
  showSignup: boolean
  terminalTabMinimized: boolean
  typedChars: number
}

export type BrowserStoryboardElements = {
  browserPage: HTMLDivElement | null
  cta: HTMLSpanElement | null
  newtabButton: HTMLSpanElement | null
  newtabRow: HTMLDivElement | null
  sendButton: HTMLSpanElement | null
  starterCard: HTMLDivElement | null
  titlebar: HTMLDivElement | null
}
