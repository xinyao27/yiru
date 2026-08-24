import type { BrowserWindow } from 'electron'

import type { Store } from '../persistence'
import { registerWindowClosing } from './main-window/closing'
import { createBrowserWindow } from './main-window/creation'
import { registerWindowDisplayLifecycle } from './main-window/display-lifecycle'
import { loadMainWindow } from './main-window/load'
import type { CreateMainWindowOptions } from './main-window/model'
import { registerWindowNavigationSecurity } from './main-window/navigation-security'
import { registerRendererLifecycle } from './main-window/renderer-lifecycle'
import { registerWindowShortcuts } from './main-window/shortcuts'

export { loadMainWindow } from './main-window/load'

export function createMainWindow(
  store: Store | null,
  options?: CreateMainWindowOptions
): BrowserWindow {
  const { mainWindow, savedMaximized } = createBrowserWindow(store, options)
  const bounds = registerWindowDisplayLifecycle(mainWindow, store, savedMaximized)
  registerWindowNavigationSecurity(mainWindow)
  const renderer = registerRendererLifecycle(mainWindow, options, bounds)
  registerWindowShortcuts(mainWindow, store, options, renderer)
  registerWindowClosing(mainWindow, store, options, bounds, renderer)

  if (!options?.deferLoad) {
    loadMainWindow(mainWindow)
  }
  return mainWindow
}
