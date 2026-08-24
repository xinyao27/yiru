import type { ExpectedTeardownScope } from '../crash-reporting/process-gone-classification'

type TimedWebContentsFlag = {
  mark: (webContentsId: number, durationMs?: number) => void
  clear: (webContentsId?: number) => void
  matches: (webContentsId: number, options?: { consume?: boolean }) => boolean
}

function createTimedWebContentsFlag(defaultDurationMs = 10_000): TimedWebContentsFlag {
  let state: { webContentsId: number; until: number } | null = null
  return {
    mark(webContentsId, durationMs = defaultDurationMs) {
      state = { webContentsId, until: Date.now() + durationMs }
    },
    clear(webContentsId) {
      if (webContentsId === undefined || state?.webContentsId === webContentsId) {
        state = null
      }
    },
    matches(webContentsId, options) {
      if (!state || Date.now() > state.until) {
        state = null
        return false
      }
      if (state.webContentsId !== webContentsId) {
        return false
      }
      if (options?.consume) {
        state = null
      }
      return true
    }
  }
}

export type RendererReloadLifecycle = {
  clearExpected: (webContentsId?: number) => void
  getExpectedTeardownScope: (webContentsId?: number) => ExpectedTeardownScope
  isRecoveryInFlight: (webContentsId: number) => boolean
  markExpected: (webContentsId: number, durationMs?: number) => void
  markRecoveryInFlight: (webContentsId: number, durationMs?: number) => void
}

export function createRendererReloadLifecycle(options: {
  isAppQuitting: () => boolean
  isUpdateQuitting: () => boolean
}): RendererReloadLifecycle {
  const expectedReload = createTimedWebContentsFlag()
  const recoveryReload = createTimedWebContentsFlag()
  return {
    clearExpected: (webContentsId) => expectedReload.clear(webContentsId),
    getExpectedTeardownScope: (webContentsId) => {
      if (options.isAppQuitting() || options.isUpdateQuitting()) {
        return 'app-shutdown'
      }
      if (webContentsId === undefined) {
        return 'none'
      }
      return expectedReload.matches(webContentsId) ? 'renderer-reload' : 'none'
    },
    isRecoveryInFlight: (webContentsId) => recoveryReload.matches(webContentsId, { consume: true }),
    markExpected: (webContentsId, durationMs) => expectedReload.mark(webContentsId, durationMs),
    markRecoveryInFlight: (webContentsId, durationMs) =>
      recoveryReload.mark(webContentsId, durationMs)
  }
}
