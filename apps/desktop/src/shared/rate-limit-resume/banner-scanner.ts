// Stateful line-buffered scanner over one pane's (ANSI-stripped) output.
// Callers push raw chunks; the scanner emits a banner at most once per cooldown.

import type { AgentType } from '@yiru/workbench-model/agent'

import {
  detectRateLimitBanner,
  RATE_LIMIT_BANNER_COOLDOWN_MS,
  RATE_LIMIT_BANNER_CONTEXT_LINES
} from './banner-detection'

// Why: the banner headline and its reset line can arrive in separate chunks,
// and an ambiguous headline is only confirmed by a later recovery hint. Keep a
// window wide enough to re-evaluate both together, but bounded so a chatty pane
// never grows the buffer.
const SCANNER_WINDOW_LINES = 3 * RATE_LIMIT_BANNER_CONTEXT_LINES

export type RateLimitBannerScanner = {
  /** Feed ANSI-stripped output. Returns the banner lines on a fresh detection. */
  push: (text: string) => string[] | null
  reset: () => void
}

export function createRateLimitBannerScanner(agent: AgentType): RateLimitBannerScanner {
  let pending = ''
  let recentLines: string[] = []
  let lastEmittedAt = 0
  let activeBannerHeadline = ''

  const emitIfNew = (banner: string[]): string[] | null => {
    const headline = banner[0] ?? ''
    // Why: trailing context grows whenever the user sends another message, but
    // it is still the same visible outage. Keep the stable headline active
    // until it leaves the scanner window instead of treating context as identity.
    if (headline === activeBannerHeadline) {
      return null
    }
    const now = Date.now()
    if (now - lastEmittedAt < RATE_LIMIT_BANNER_COOLDOWN_MS) {
      return null
    }
    lastEmittedAt = now
    activeBannerHeadline = headline
    return banner
  }

  return {
    push: (text) => {
      pending += text
      const parts = pending.split('\n')
      // The trailing fragment is an incomplete line; hold it for the next chunk.
      pending = parts.pop() ?? ''
      if (parts.length === 0) {
        return null
      }
      recentLines = [...recentLines, ...parts].slice(-SCANNER_WINDOW_LINES)
      const banner = detectRateLimitBanner(recentLines, agent)
      if (!banner) {
        activeBannerHeadline = ''
        return null
      }
      return emitIfNew(banner)
    },
    reset: () => {
      pending = ''
      recentLines = []
      activeBannerHeadline = ''
    }
  }
}
