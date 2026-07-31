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
  let lastEmittedBanner = ''

  const emitIfNew = (banner: string[]): string[] | null => {
    const signature = banner.join('\n')
    // Why: a limit banner stays on screen for the whole outage and is redrawn
    // on every frame. Suppress the identical banner outright — only a
    // genuinely different one, after the cooldown, counts as a new hit.
    if (signature === lastEmittedBanner) {
      return null
    }
    const now = Date.now()
    if (now - lastEmittedAt < RATE_LIMIT_BANNER_COOLDOWN_MS) {
      return null
    }
    lastEmittedAt = now
    lastEmittedBanner = signature
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
      return banner ? emitIfNew(banner) : null
    },
    reset: () => {
      pending = ''
      recentLines = []
      lastEmittedBanner = ''
    }
  }
}
