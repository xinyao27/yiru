import { BrowserWindow, ipcMain } from 'electron'
import { RUNTIME_LOOPBACK_CREDENTIALS_CHANNEL } from '~shared/runtime-loopback'

type RuntimeLoopbackCredentialsProvider = {
  getRendererLoopbackCredentials: (
    webContentsId: number,
    rendererUrl: string
  ) => Promise<{ endpoint: string; processToken: Uint8Array<ArrayBuffer> }>
}

export function registerRuntimeLoopbackCredentials(
  provider: RuntimeLoopbackCredentialsProvider
): void {
  ipcMain.removeHandler(RUNTIME_LOOPBACK_CREDENTIALS_CHANNEL)
  ipcMain.handle(RUNTIME_LOOPBACK_CREDENTIALS_CHANNEL, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const isMainFrame = event.senderFrame === event.sender.mainFrame
    if (!window || window.isDestroyed() || !isMainFrame) {
      throw new Error('Runtime loopback credentials require a main BrowserWindow frame')
    }
    return provider.getRendererLoopbackCredentials(event.sender.id, event.sender.getURL())
  })
}
