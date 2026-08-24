import { release } from 'node:os'
import { join } from 'node:path'

import { is } from '@electron-toolkit/utils'
import type { BrowserWindow } from 'electron'
import {
  renderingHostBootstrapQuery,
  type RenderingHostBootstrap
} from '~shared/rendering-host-bootstrap'

function getRenderingHostBootstrap(): RenderingHostBootstrap {
  return {
    platform: process.platform,
    osRelease: release(),
    displayServer:
      process.platform === 'linux'
        ? process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY
          ? 'wayland'
          : 'x11'
        : null
  }
}

export function loadMainWindow(mainWindow: BrowserWindow): void {
  const query = renderingHostBootstrapQuery(getRenderingHostBootstrap())
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL)
    for (const [key, value] of Object.entries(query)) {
      rendererUrl.searchParams.set(key, value)
    }
    void mainWindow.loadURL(rendererUrl.toString())
  } else {
    void mainWindow.loadFile(join(__dirname, '../../renderer/index.html'), { query })
  }
}
