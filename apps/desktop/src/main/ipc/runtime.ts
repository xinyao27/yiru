import { BrowserWindow, ipcMain } from 'electron'
import type {
  RuntimeBrowserDriverState,
  RuntimeSyncWindowGraph,
  RuntimeSyncWindowGraphResult,
  RuntimeTerminalDriverState
} from '~shared/runtime-types'

import { registerRuntimeOrpcMessagePortHandler } from '../runtime/rpc/orpc/message-port-handler'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'

export function registerRuntimeHandlers(runtime: YiruRuntimeService): void {
  registerRuntimeOrpcMessagePortHandler(runtime)

  ipcMain.removeHandler('runtime:syncWindowGraph')
  ipcMain.handle(
    'runtime:syncWindowGraph',
    (event, graph: RuntimeSyncWindowGraph): RuntimeSyncWindowGraphResult => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) {
        throw new Error('Runtime graph sync must originate from a BrowserWindow')
      }
      return runtime.syncWindowGraph(window.id, graph)
    }
  )

  ipcMain.removeHandler('runtime:getTerminalFitOverrides')
  ipcMain.handle(
    'runtime:getTerminalFitOverrides',
    (): {
      ptyId: string
      mode: 'mobile-fit' | 'remote-desktop-fit'
      cols: number
      rows: number
    }[] =>
      Array.from(runtime.getAllTerminalFitOverrides().entries()).map(([ptyId, override]) => ({
        ptyId,
        ...override
      }))
  )

  ipcMain.removeHandler('runtime:getTerminalDrivers')
  ipcMain.handle(
    'runtime:getTerminalDrivers',
    (): { ptyId: string; driver: RuntimeTerminalDriverState }[] =>
      Array.from(runtime.getAllTerminalDrivers().entries()).map(([ptyId, driver]) => ({
        ptyId,
        driver
      }))
  )

  ipcMain.removeHandler('runtime:getBrowserDrivers')
  ipcMain.handle(
    'runtime:getBrowserDrivers',
    (): { browserPageId: string; driver: RuntimeBrowserDriverState }[] =>
      Array.from(runtime.browserCommands.getDrivers().entries()).map(([browserPageId, driver]) => ({
        browserPageId,
        driver
      }))
  )

  ipcMain.removeHandler('runtime:restoreTerminalFit')
  ipcMain.handle('runtime:restoreTerminalFit', async (_event, args: { ptyId: string }) => {
    // Why: reclaimTerminalForDesktop includes the awaited PTY resize; returning
    // that promise directly makes Electron try to structured-clone a Promise.
    try {
      return { restored: await runtime.reclaimTerminalForDesktop(args.ptyId) }
    } catch {
      return { restored: false }
    }
  })

  ipcMain.removeHandler('runtime:reclaimBrowserForDesktop')
  ipcMain.handle(
    'runtime:reclaimBrowserForDesktop',
    (_event, args: { browserPageId: string }): { reclaimed: boolean } => {
      try {
        return { reclaimed: runtime.browserCommands.reclaimForDesktop(args.browserPageId) }
      } catch {
        return { reclaimed: false }
      }
    }
  )
}
