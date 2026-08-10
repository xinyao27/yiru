import type { BrowserGrabRect } from './control-input.js'

export type BrowserControlBooleanResult = { accepted: boolean }

export type BrowserGrabPageContext = {
  sanitizedUrl: string
  title: string
  viewportWidth: number
  viewportHeight: number
  scrollX: number
  scrollY: number
  devicePixelRatio: number
  capturedAt: string
}

export type BrowserGrabAccessibility = {
  role: string | null
  accessibleName: string | null
  ariaLabel: string | null
  ariaLabelledBy: string | null
}

export type BrowserGrabComputedStyles = {
  display: string
  position: string
  width: string
  height: string
  margin: string
  padding: string
  color: string
  backgroundColor: string
  border: string
  borderRadius: string
  fontFamily: string
  fontSize: string
  fontWeight: string
  lineHeight: string
  textAlign: string
  zIndex: string
}

export type BrowserGrabTarget = {
  tagName: string
  selector: string
  elementPath?: string
  fullPath?: string
  cssClasses?: string
  nearbyElements?: string[]
  selectedText?: string | null
  isFixed?: boolean
  reactComponents?: string | null
  sourceFile?: string | null
  textSnippet: string
  htmlSnippet: string
  attributes: Record<string, string>
  accessibility: BrowserGrabAccessibility
  rectViewport: BrowserGrabRect
  rectPage: BrowserGrabRect
  computedStyles: BrowserGrabComputedStyles
}

export type BrowserGrabScreenshot = {
  mimeType: 'image/png'
  dataUrl: string
  width: number
  height: number
}

export type BrowserGrabPayload = {
  page: BrowserGrabPageContext
  target: BrowserGrabTarget
  nearbyText: string[]
  ancestorPath: string[]
  screenshot: BrowserGrabScreenshot | null
}

export type BrowserGrabCancelReason = 'user' | 'tab-inactive' | 'navigation' | 'evicted' | 'timeout'

export type BrowserGrabResult =
  | { opId: string; kind: 'selected'; payload: BrowserGrabPayload }
  | { opId: string; kind: 'context-selected'; payload: BrowserGrabPayload }
  | { opId: string; kind: 'cancelled'; reason: BrowserGrabCancelReason }
  | { opId: string; kind: 'error'; reason: string }

export type BrowserGrabRejectReason = 'not-ready' | 'not-authorized' | 'already-active'

export type BrowserGrabSetModeResult = { ok: true } | { ok: false; reason: BrowserGrabRejectReason }

export type BrowserGrabCaptureResult =
  | { ok: true; screenshot: BrowserGrabScreenshot }
  | { ok: false; reason: string }

export type BrowserGrabExtractResult =
  | { ok: true; payload: BrowserGrabPayload }
  | { ok: false; reason: string }
