// Mirrors the store's rate-limit state onto sonner toasts: one toast per
// blocked pane, updated in place as the notice moves blocked → scheduled.

import { useEffect } from 'react'
import { useAppStore } from '~renderer/store/state'

import { selectRateLimitNotice, type RateLimitNotice } from './notice-selection'
import { dismissRateLimitResumeToast, showRateLimitResumeToast } from './notification'

// Why: the toast body renders a countdown, and a body only re-renders when the
// toast is raised again. Re-sync on a slow interval so "in about 2h" does not
// sit frozen for the whole outage.
const COUNTDOWN_REFRESH_MS = 60_000

/** Identity of what a toast is currently showing, so reshows stay idempotent. */
function noticeSignature(notice: RateLimitNotice): string {
  const { hit, schedule } = notice
  return `${hit.detectedAt}:${schedule?.id ?? 'none'}:${schedule?.status ?? 'none'}`
}

/** Mounted once at App level, above any pane subtree that can unmount. */
export function useRateLimitResumeNotifications(): void {
  useEffect(() => {
    const shown = new Map<string, string>()
    const suppressed = new Map<string, string>()

    const sync = (): void => {
      const state = useAppStore.getState()
      const ptyIds = new Set([
        ...Object.keys(state.rateLimitHitByPtyId),
        ...Object.keys(state.rateLimitResumeByPtyId)
      ])
      for (const ptyId of ptyIds) {
        const notice = selectRateLimitNotice(state, ptyId)
        if (!notice) {
          continue
        }
        const signature = noticeSignature(notice)
        // A user-closed toast stays closed until the notice itself changes.
        if (suppressed.get(ptyId) === signature) {
          continue
        }
        suppressed.delete(ptyId)
        shown.set(ptyId, signature)
        showRateLimitResumeToast(notice)
      }
      for (const ptyId of shown.keys()) {
        if (!ptyIds.has(ptyId)) {
          shown.delete(ptyId)
          suppressed.delete(ptyId)
          dismissRateLimitResumeToast(ptyId)
        }
      }
    }

    const markSuppressed = (ptyId: string): void => {
      const signature = shown.get(ptyId)
      if (signature) {
        suppressed.set(ptyId, signature)
      }
    }
    subscribeToRateLimitToastDismissals(markSuppressed)

    sync()
    const unsubscribeStore = useAppStore.subscribe((state, previousState) => {
      if (
        state.rateLimitHitByPtyId === previousState.rateLimitHitByPtyId &&
        state.rateLimitResumeByPtyId === previousState.rateLimitResumeByPtyId
      ) {
        return
      }
      sync()
    })
    const refresh = setInterval(sync, COUNTDOWN_REFRESH_MS)

    return () => {
      unsubscribeStore()
      clearInterval(refresh)
      subscribeToRateLimitToastDismissals(null)
      for (const ptyId of shown.keys()) {
        dismissRateLimitResumeToast(ptyId)
      }
    }
  }, [])
}

// Why: sonner's onDismiss fires inside the toast, which has no handle on the
// subscriber's bookkeeping. This module-level hand-off keeps the suppression
// map private to the hook instead of promoting it to shared mutable state.
let dismissListener: ((ptyId: string) => void) | null = null

function subscribeToRateLimitToastDismissals(listener: ((ptyId: string) => void) | null): void {
  dismissListener = listener
}

export function notifyRateLimitToastDismissed(ptyId: string): void {
  dismissListener?.(ptyId)
}
