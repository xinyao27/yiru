import { useCallback, useEffect, useRef, useState } from 'react'

import { useAppStore } from '@/store'

// One-time discovery highlight for the screenshot-markup Draw button. Shows once
// per install — the first time the button is usable and its surface is active —
// so users notice the new tool. Gated on its own localStorage flag (not a
// contextual tour), so it fires for everyone, including users who already
// finished the capped browser tour.
//
// Stays open until the user dismisses it (outside click / Escape / blur), clicks
// Draw, or the button stops being eligible. No auto-timeout.
const MARKUP_DRAW_HINT_SEEN_KEY = 'yiru.browser.markup-draw-hint-seen'

// Why: a plain, side-effect-free read so it's safe to call from render
// (including React's Strict Mode double-render) — unlike a destructive
// check-and-set, reading this twice can never change the answer. Returns
// true (already seen) when storage is unavailable so a private-mode session
// never risks nagging on every open.
function hasSeenMarkupDrawHint(): boolean {
  try {
    return window.localStorage.getItem(MARKUP_DRAW_HINT_SEEN_KEY) === 'true'
  } catch {
    return true
  }
}

// Why: the one real mutation, kept apart from the read above so the read
// stays pure. A failed write just means this install may see the hint again
// next launch — the same fail-open behavior storage failures already get
// from hasSeenMarkupDrawHint.
function markMarkupDrawHintSeen(): void {
  try {
    window.localStorage.setItem(MARKUP_DRAW_HINT_SEEN_KEY, 'true')
  } catch {
    // Why: nothing to roll back — see the comment above.
  }
}

export type MarkupDrawHint = { hintOpen: boolean; dismissHint: () => void }

export function useMarkupDrawHint(eligible: boolean): MarkupDrawHint {
  const persistedUIReady = useAppStore((state) => state.persistedUIReady)
  const [dismissed, setDismissed] = useState(false)
  // Why: read the persisted flag once, lazily, on first render — the same
  // "if current is null, compute" idiom used for other one-time reads.
  // Captured once and never reassigned, so an already-open hint can't flip
  // closed just because this mount goes on to persist the flag below for
  // the *next* mount.
  const wasAlreadySeenRef = useRef<boolean | null>(null)
  if (wasAlreadySeenRef.current === null) {
    wasAlreadySeenRef.current = hasSeenMarkupDrawHint()
  }
  const hasClaimedRef = useRef(false)

  useEffect(() => {
    // Why: persist the flag the first time the button is genuinely eligible
    // so a later mount — this pane reopening, another pane, the next launch
    // — doesn't show the hint again. This only syncs an external system
    // (localStorage); it never sets React state, so there is no state to
    // adjust when `eligible` changes and nothing for
    // no-adjust-state-on-prop-change to flag.
    if (wasAlreadySeenRef.current || hasClaimedRef.current || !persistedUIReady || !eligible) {
      return
    }
    hasClaimedRef.current = true
    markMarkupDrawHintSeen()
  }, [eligible, persistedUIReady])

  // Why: only nudge once the app is ready, the button is usable on a visible
  // surface, and this install had never seen it as of this mount. If
  // eligibility drops mid-hint (tab switch, grab started, markup open, blank
  // tab), close it so a forced-open floating layer can't stick over a hidden
  // or disabled control at (0,0).
  const hintOpen = persistedUIReady && eligible && !wasAlreadySeenRef.current && !dismissed

  const dismissHint = useCallback(() => setDismissed(true), [])
  return { hintOpen, dismissHint }
}
