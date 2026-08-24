import { Menu, type BrowserWindow } from 'electron'
import {
  DEFAULT_RENDERER_RECOVERY_MAX_RECOVERIES,
  DEFAULT_RENDERER_RECOVERY_WINDOW_MS,
  RendererRecoveryCircuitBreaker
} from '~main/crash-reporting/renderer-recovery-circuit-breaker'
import { isCrashReportReason } from '~shared/crash-reporting'

import { buildEditableContextMenuTemplate } from '../editable-context-menu'
import type { WindowBoundsController } from './display-lifecycle'
import { loadMainWindow } from './load'
import type { CreateMainWindowOptions } from './model'

export type WindowFocusSurface = 'markdownEditor' | 'terminalInput' | 'shortcutRecorder'

export type WindowInputFocus = Record<WindowFocusSurface, boolean>

export type RendererLifecycle = {
  getFocus: () => WindowInputFocus
  hasProcessGone: () => boolean
  setFocus: (surface: WindowFocusSurface, focused: boolean) => void
}

const EMPTY_FOCUS: WindowInputFocus = {
  markdownEditor: false,
  terminalInput: false,
  shortcutRecorder: false
}

export function registerRendererLifecycle(
  mainWindow: BrowserWindow,
  options: CreateMainWindowOptions | undefined,
  bounds: WindowBoundsController
): RendererLifecycle {
  let focus = { ...EMPTY_FOCUS }
  let rendererProcessGone = false
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null
  const rendererWebContentsId = mainWindow.webContents.id
  const recoveryCircuitBreaker = new RendererRecoveryCircuitBreaker({
    windowMs: DEFAULT_RENDERER_RECOVERY_WINDOW_MS,
    maxRecoveries: DEFAULT_RENDERER_RECOVERY_MAX_RECOVERIES
  })

  const resetFocus = (): void => {
    focus = { ...EMPTY_FOCUS }
  }
  const clearRecoveryTimer = (): void => {
    if (recoveryTimer) {
      clearTimeout(recoveryTimer)
      recoveryTimer = null
    }
  }
  const canRecover = (details: Electron.RenderProcessGoneDetails): boolean => {
    return (
      !bounds.isClosing() &&
      options?.getIsQuitting?.() !== true &&
      options?.shouldRecoverRenderer?.(details, rendererWebContentsId) !== false &&
      !mainWindow.isDestroyed()
    )
  }
  const scheduleRecovery = (details: Electron.RenderProcessGoneDetails): void => {
    if (recoveryTimer || !isCrashReportReason(details.reason) || !canRecover(details)) {
      return
    }
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null
      if (!canRecover(details)) {
        return
      }
      const recovery = recoveryCircuitBreaker.registerRecoveryAttempt(Date.now())
      if (!recovery.allowed) {
        options?.onRendererRecoveryExhausted?.({
          details,
          webContentsId: rendererWebContentsId,
          recentRecoveryCount: recovery.recentRecoveryCount
        })
        return
      }
      options?.onBeforeRecoveryReload?.(rendererWebContentsId)
      loadMainWindow(mainWindow)
    }, 250)
  }

  mainWindow.webContents.on('context-menu', (_event, params) => {
    const template = buildEditableContextMenuTemplate(params, mainWindow.webContents)
    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup({ window: mainWindow, x: params.x, y: params.y })
    }
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    rendererProcessGone = true
    resetFocus()
    if (!bounds.isClosing()) {
      options?.onRendererProcessGone?.(details, rendererWebContentsId)
      console.error('[window] Renderer process gone; close confirmation will be bypassed', details)
    }
    scheduleRecovery(details)
  })
  mainWindow.webContents.on('destroyed', resetFocus)
  mainWindow.webContents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) {
      resetFocus()
    }
  })
  mainWindow.webContents.on('did-finish-load', () => {
    rendererProcessGone = false
    clearRecoveryTimer()
  })
  mainWindow.on('closed', () => {
    resetFocus()
    clearRecoveryTimer()
  })

  return {
    getFocus: () => ({ ...focus }),
    hasProcessGone: () => rendererProcessGone,
    setFocus: (surface, focused) => {
      focus = { ...focus, [surface]: focused }
    }
  }
}
