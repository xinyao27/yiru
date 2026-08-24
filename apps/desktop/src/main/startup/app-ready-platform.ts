import { electronApp } from '@electron-toolkit/utils'
import { BrowserWindow, app, safeStorage } from 'electron'

import { browserCertificateTrustController } from '../browser/manager'
import { setRuntimeHostSecureStorageProvider } from '../runtime/host/secure-storage-provider'
import { setNotificationShellAttentionSignal } from '../runtime/notification-shell-attention'
import { setTrayAttention } from '../tray/system-tray'
import { isMainWindowVisible } from '../window/main-window-visibility'
import type { DevInstanceIdentity } from './dev-instance-identity'

export function initializeAppReadyPlatform(identity: DevInstanceIdentity): void {
  app.on(
    'certificate-error',
    (event, webContents, url, error, certificate, callback, isMainFrame) => {
      browserCertificateTrustController.handleCertificateError({
        event,
        webContents,
        url,
        error,
        certificate,
        callback,
        isMainFrame
      })
    }
  )
  electronApp.setAppUserModelId(identity.appUserModelId)
  app.setName(identity.name)
  setRuntimeHostSecureStorageProvider({
    decryptString: (value) => safeStorage.decryptString(value),
    encryptString: (value) => safeStorage.encryptString(value),
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable()
  })
  setNotificationShellAttentionSignal(() => {
    const activeWindow =
      BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null
    if (!isMainWindowVisible(activeWindow)) {
      setTrayAttention(true)
    }
  })
}
