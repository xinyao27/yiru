import type { RuntimeConnectionBootstrap } from '@yiru/shared/preload/bootstrap-contract'
import { contextBridge, ipcRenderer } from 'electron'
import { RUNTIME_LOOPBACK_CREDENTIALS_CHANNEL } from '~shared/runtime-loopback'

const runtimeConnection: RuntimeConnectionBootstrap = {
  // Why: terminal-multiplex.md §21.1 permits plaintext loopback only when the
  // process token reaches this isolated renderer through the audited preload.
  // The token never enters a URL, storage, logs, breadcrumbs, or analytics;
  // every capability call after this bootstrap is authenticated oRPC over WS.
  getCredentials: () => ipcRenderer.invoke(RUNTIME_LOOPBACK_CREDENTIALS_CHANNEL)
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('runtimeConnection', runtimeConnection)
} else {
  ;(window as unknown as { runtimeConnection: RuntimeConnectionBootstrap }).runtimeConnection =
    runtimeConnection
}
