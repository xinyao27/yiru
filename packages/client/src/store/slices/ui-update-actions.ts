import type { StateCreator } from 'zustand'
import { shellClient } from '~renderer/runtime/shell-client'
import { setRuntimeUIState } from '~renderer/runtime/ui-client'
import { normalizeBrowserPageZoomLevel } from '~shared/browser/page-zoom'
import { normalizeKagiSessionLink } from '~shared/browser/url'

import type { AppState } from '../types'
import type { UISlice } from './ui'

export function createUIUpdateActions(
  set: Parameters<StateCreator<AppState, [], [], UISlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], UISlice>>[1]
): Pick<
  UISlice,
  | 'setUpdateStatus'
  | 'clearDismissedUpdateVersion'
  | 'dismissUpdate'
  | 'setUpdateCardCollapsed'
  | 'markUpdateReassuranceSeen'
  | 'setIsFullScreen'
  | 'setBrowserDefaultUrl'
  | 'setBrowserDefaultSearchEngine'
  | 'setBrowserDefaultZoomLevel'
  | 'setBrowserKagiSessionLink'
> {
  return {
    setUpdateStatus: (status) => {
      const prevState = get().updateStatus.state
      const update: Partial<
        Pick<
          UISlice,
          'updateStatus' | 'updateChangelog' | 'updateCardCollapsed' | 'updateUserInitiatedCycle'
        >
      > = {
        updateStatus: status
      }
      if (status.state === 'checking') {
        update.updateUserInitiatedCycle = status.userInitiated === true
      } else if (status.state === 'idle') {
        update.updateUserInitiatedCycle = false
      }
      if (status.state === 'available') {
        // Why: cache changelog from each 'available' payload so the card retains
        // rich content across downloading/error/downloaded transitions. Always
        // overwrite (even with null) to prevent a previous rich changelog from
        // leaking into a later simple-mode update for a different version.
        update.updateChangelog = status.changelog ?? null
      } else if (
        status.state === 'idle' ||
        status.state === 'checking' ||
        status.state === 'not-available'
      ) {
        // Why: reset on cycle-boundary states so stale rich content from a
        // previous update cycle cannot resurface.
        update.updateChangelog = null
      }
      // For 'downloading', 'downloaded', 'error': leave updateChangelog untouched
      // so the card can keep showing rich content from the original 'available'.
      if (status.state !== prevState) {
        // Why: re-surface the card on every phase transition so a prior collapse
        // of `downloading` doesn't bury the `downloaded`/`error` that follows.
        update.updateCardCollapsed = false
      }
      set(update)
    },
    clearDismissedUpdateVersion: () => {
      set({ dismissedUpdateVersion: null })
    },
    dismissUpdate: (versionOverride?: string) =>
      set((s) => {
        // Why: the 'error' variant has no version field, so the card passes
        // the cached version explicitly via versionOverride.
        const dismissedUpdateVersion =
          versionOverride ?? ('version' in s.updateStatus ? (s.updateStatus.version ?? null) : null)
        const activeNudgeId =
          'activeNudgeId' in s.updateStatus ? (s.updateStatus.activeNudgeId ?? null) : null
        // Why: dismissing an update is user intent, not transient view state. Persist
        // the dismissed version so relaunching the app does not immediately re-show
        // the same reminder card until a newer release appears.
        void setRuntimeUIState(get().settings, { dismissedUpdateVersion }).catch(console.error)
        // Why: only dismiss the main-process nudge campaign when the visible card
        // actually came from a nudge-driven update cycle. Ordinary update dismissals
        // must not consume the active campaign state.
        if (activeNudgeId) {
          void shellClient.updater.dismissNudge().catch(console.error)
        }
        return { dismissedUpdateVersion, updateUserInitiatedCycle: false }
      }),
    setUpdateCardCollapsed: (collapsed) => set({ updateCardCollapsed: collapsed }),
    markUpdateReassuranceSeen: () => {
      void setRuntimeUIState(get().settings, { updateReassuranceSeen: true }).catch(console.error)
      set({ updateReassuranceSeen: true })
    },
    setIsFullScreen: (v) => set({ isFullScreen: v }),
    setBrowserDefaultUrl: (url) => {
      void setRuntimeUIState(get().settings, { browserDefaultUrl: url }).catch(console.error)
      set({ browserDefaultUrl: url })
    },
    setBrowserDefaultSearchEngine: (engine) => {
      void setRuntimeUIState(get().settings, { browserDefaultSearchEngine: engine }).catch(
        console.error
      )
      set({ browserDefaultSearchEngine: engine })
    },
    setBrowserDefaultZoomLevel: (level) => {
      const normalized = normalizeBrowserPageZoomLevel(level)
      void setRuntimeUIState(get().settings, { browserDefaultZoomLevel: normalized }).catch(
        console.error
      )
      set({ browserDefaultZoomLevel: normalized })
    },
    setBrowserKagiSessionLink: (link) => {
      const normalized = link ? normalizeKagiSessionLink(link) : null
      void setRuntimeUIState(get().settings, { browserKagiSessionLink: normalized }).catch(
        console.error
      )
      set({ browserKagiSessionLink: normalized })
    }
  }
}
