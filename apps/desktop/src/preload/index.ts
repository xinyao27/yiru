import type { RuntimeConnectionBootstrap } from '@yiru/shared/preload/bootstrap-contract'
import { contextBridge, ipcRenderer } from 'electron'
import { RUNTIME_LOOPBACK_CREDENTIALS_CHANNEL } from '~shared/runtime-loopback'

import { installNativeFileDropAdapter } from './native-file-drop'

const runtimeConnection: RuntimeConnectionBootstrap = {
  // Why: renderer chrome is selected while application modules evaluate, before
  // an oRPC round trip can finish. Keep immutable host identity in bootstrap.
  renderingHost: {
    platform: process.platform,
    osRelease: process.getSystemVersion(),
    displayServer:
      process.platform === 'linux'
        ? process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY
          ? 'wayland'
          : 'x11'
        : null
  },
  // Why: docs/reference/terminal-multiplex.md §21.1 permits plaintext loopback only when the
  // process token reaches this isolated renderer through the audited preload.
  // The token never enters a URL, storage, logs, breadcrumbs, or analytics;
  // every capability call after this bootstrap is authenticated oRPC over WS.
  getCredentials: () => ipcRenderer.invoke(RUNTIME_LOOPBACK_CREDENTIALS_CHANNEL)
}

installNativeFileDropAdapter()

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('runtimeConnection', runtimeConnection)
} else {
  ;(window as unknown as { runtimeConnection: RuntimeConnectionBootstrap }).runtimeConnection =
    runtimeConnection
}
