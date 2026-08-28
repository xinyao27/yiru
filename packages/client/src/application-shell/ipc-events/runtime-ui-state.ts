import { dispatchZoomLevelChanged } from '~renderer/application-shell/zoom-events'
import { computeEditorFontSize, nextEditorFontZoomLevel } from '~renderer/editor/font-zoom'
import { subscribeRateLimitUpdates } from '~renderer/runtime/rate-limit-events-client'
import { fetchRateLimitSnapshot } from '~renderer/runtime/rate-limits-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { setRuntimeUIState } from '~renderer/runtime/ui-client'
import { subscribeToWorkspaceSpaceScanProgress } from '~renderer/runtime/workspace-space-client'
import { ZOOM_MAX, ZOOM_MIN, zoomLevelToPercent } from '~renderer/settings/constants'
import { applyUIZoom } from '~renderer/settings/ui-zoom'
import { useAppStore } from '~renderer/store/state'

import { resolveZoomTarget } from '../resolve-zoom-target'

const ZOOM_STEP = 0.5

export function subscribeRuntimeUiStateEvents(): () => void {
  let initialRateLimitsSnapshotPending = true
  let receivedRateLimitsPushBeforeInitialSnapshot = false
  const unsubs = [
    subscribeRateLimitUpdates((state) => {
      if (initialRateLimitsSnapshotPending) {
        receivedRateLimitsPushBeforeInitialSnapshot = true
      }
      useAppStore.getState().setRateLimitsFromPush(state)
    }),
    subscribeToWorkspaceSpaceScanProgress((progress) =>
      useAppStore.getState().applyWorkspaceSpaceProgress(progress)
    ),
    shellClient.ui.onTerminalZoom((direction) => {
      const store = useAppStore.getState()
      const target = resolveZoomTarget({
        activeView: store.activeView,
        activeTabType: store.activeTabType,
        activeElement: document.activeElement
      })
      if (target === 'terminal') {
        return
      }
      if (target === 'editor') {
        const next = nextEditorFontZoomLevel(store.editorFontZoomLevel, direction)
        store.setEditorFontZoomLevel(next)
        void setRuntimeUIState(store.settings, { editorFontZoomLevel: next })
        const baseFontSize = store.settings?.terminalFontSize ?? 13
        const percent = Math.round((computeEditorFontSize(baseFontSize, next) / baseFontSize) * 100)
        dispatchZoomLevelChanged('editor', percent)
        return
      }
      const current = shellClient.ui.getZoomLevel()
      const rawNext =
        direction === 'in' ? current + ZOOM_STEP : direction === 'out' ? current - ZOOM_STEP : 0
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, rawNext))
      applyUIZoom(next)
      void setRuntimeUIState(store.settings, { uiZoomLevel: next })
      dispatchZoomLevelChanged('ui', zoomLevelToPercent(next))
    })
  ]

  void fetchRateLimitSnapshot().then((state) => {
    initialRateLimitsSnapshotPending = false
    if (!receivedRateLimitsPushBeforeInitialSnapshot) {
      useAppStore.getState().setRateLimitsFromPush(state)
    }
  })
  return () => unsubs.forEach((unsubscribe) => unsubscribe())
}
