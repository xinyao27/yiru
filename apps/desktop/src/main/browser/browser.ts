import { BrowserWindow, dialog, webContents } from 'electron'
import type { BrowserCookieImportResult } from '~shared/types'

import { translateMain } from '../i18n/main-i18n'
import { importCookiesFromFile } from './cookie-import'
import { requireBrowserSession } from './session'
import { browserSessionRegistry } from './session-registry'

let trustedBrowserRendererWebContentsId: number | null = null

async function pickCookieFile(parentWindow: Electron.BrowserWindow | null): Promise<string | null> {
  // Why: source selection stays in the shell so a compromised renderer cannot
  // turn cookie import into arbitrary absolute-path reads.
  const options = {
    title: translateMain('browser.cookieImport.dialogTitle', 'Import Cookies'),
    filters: [
      {
        name: translateMain('browser.cookieImport.cookieFiles', 'Cookie Files'),
        extensions: ['json']
      },
      {
        name: translateMain('browser.cookieImport.allFiles', 'All Files'),
        extensions: ['*']
      }
    ],
    properties: ['openFile' as const]
  }
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

function isTrustedBrowserRenderer(sender: Electron.WebContents): boolean {
  if (sender.isDestroyed() || sender.getType() !== 'window') {
    return false
  }
  if (trustedBrowserRendererWebContentsId != null) {
    return sender.id === trustedBrowserRendererWebContentsId
  }
  const senderUrl = sender.getURL()
  if (process.env.ELECTRON_RENDERER_URL) {
    try {
      return new URL(senderUrl).origin === new URL(process.env.ELECTRON_RENDERER_URL).origin
    } catch {
      return false
    }
  }
  return senderUrl.startsWith('file://')
}

export function setTrustedBrowserRendererWebContentsId(webContentsId: number | null): void {
  trustedBrowserRendererWebContentsId = webContentsId
}

// Why: the native picker and selected absolute path stay in main. The shell
// contract carries only the profile id in and the sanitized import result out.
export async function importShellBrowserCookies(
  webContentsId: number,
  args: { profileId: string }
): Promise<BrowserCookieImportResult> {
  const sender = webContents.fromId(webContentsId)
  if (!sender || !isTrustedBrowserRenderer(sender)) {
    return { ok: false, reason: 'Not authorized' }
  }
  const profile = browserSessionRegistry.getProfile(args.profileId)
  if (!profile) {
    return { ok: false, reason: 'Session profile not found.' }
  }
  const filePath = await pickCookieFile(BrowserWindow.fromWebContents(sender))
  if (!filePath) {
    return { ok: false, reason: 'canceled' }
  }
  const targetSession = requireBrowserSession(profile.partition)
  const result = await importCookiesFromFile(filePath, profile.partition, targetSession.cookies)
  if (!result.ok) {
    return result
  }
  browserSessionRegistry.updateProfileSource(args.profileId, {
    browserFamily: 'manual',
    importedAt: Date.now()
  })
  return { ...result, profileId: args.profileId }
}
