import type { BrowserSetAnnotationViewportBridgeArgs } from '~shared/browser/annotation-viewport-bridge'
import type {
  BrowserAwaitGrabSelectionArgs,
  BrowserCancelGrabArgs,
  BrowserCaptureSelectionScreenshotArgs,
  BrowserExtractHoverArgs,
  BrowserSetGrabModeArgs
} from '~shared/browser/grab-types'
import type { BrowserSessionProfileScope, BrowserViewportOverride } from '~shared/types'

import { callRuntimeOrpc, callShellOrpc } from './orpc-client'

const LOCAL_RUNTIME_TARGET = { kind: 'local' } as const

export type BrowserGuestRegistrationInput = {
  browserPageId: string
  workspaceId: string
  worktreeId: string
  sessionProfileId?: string | null
  webContentsId: number
}

export async function registerBrowserGuest(input: BrowserGuestRegistrationInput): Promise<boolean> {
  const result = await callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.pageControl.register,
    {
      backendPageId: `electron-webcontents:${input.webContentsId}`,
      browserPageId: input.browserPageId,
      sessionProfileId: input.sessionProfileId,
      workspaceId: input.workspaceId,
      worktreeId: input.worktreeId
    }
  )
  return result.accepted
}

export async function unregisterBrowserGuest(input: {
  browserPageId: string
  expectedWebContentsId: number
}): Promise<boolean> {
  const result = await callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.pageControl.unregister,
    {
      browserPageId: input.browserPageId,
      expectedBackendPageId: `electron-webcontents:${input.expectedWebContentsId}`
    }
  )
  return result.accepted
}

export async function notifyActiveBrowserPage(browserPageId: string): Promise<boolean> {
  const result = await callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.pageControl.setActive,
    { browserPageId }
  )
  return result.accepted
}

export async function openBrowserDevTools(browserPageId: string): Promise<boolean> {
  const result = await callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.pageControl.openDevTools,
    { browserPageId }
  )
  return result.accepted
}

export async function setBrowserViewportOverride(
  browserPageId: string,
  override: BrowserViewportOverride | null
): Promise<boolean> {
  const result = await callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.pageControl.setViewportOverride,
    { browserPageId, override }
  )
  return result.accepted
}

export async function setBrowserAnnotationViewport(
  input: BrowserSetAnnotationViewportBridgeArgs
): Promise<boolean> {
  const result = await callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.pageControl.setAnnotationViewport,
    input
  )
  return result.accepted
}

export async function cancelBrowserDownload(downloadId: string): Promise<boolean> {
  const result = await callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.downloadCancel,
    { downloadId }
  )
  return result.accepted
}

export function setBrowserGrabMode(input: BrowserSetGrabModeArgs) {
  return callRuntimeOrpc(LOCAL_RUNTIME_TARGET, (client) => client.browser.grab.setMode, input)
}

export function awaitBrowserGrabSelection(input: BrowserAwaitGrabSelectionArgs) {
  return callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.grab.awaitSelection,
    input
  )
}

export async function cancelBrowserGrab(input: BrowserCancelGrabArgs): Promise<boolean> {
  const result = await callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.grab.cancel,
    input
  )
  return result.accepted
}

export function captureBrowserGrabSelection(input: BrowserCaptureSelectionScreenshotArgs) {
  return callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.grab.captureSelection,
    input
  )
}

export function extractBrowserGrabHover(input: BrowserExtractHoverArgs) {
  return callRuntimeOrpc(LOCAL_RUNTIME_TARGET, (client) => client.browser.grab.extractHover, input)
}

export function proceedBrowserCertificate(input: { browserPageId: string; challengeId: string }) {
  return callRuntimeOrpc(LOCAL_RUNTIME_TARGET, (client) => client.browser.certificate.proceed, {
    page: input.browserPageId,
    challengeId: input.challengeId
  })
}

export function listLocalBrowserProfiles() {
  return callRuntimeOrpc(LOCAL_RUNTIME_TARGET, (client) => client.browser.profileList, undefined, {
    timeoutMs: 15_000
  })
}

export async function createLocalBrowserProfile(scope: BrowserSessionProfileScope, label: string) {
  if (scope === 'default') {
    return { profile: null }
  }
  return callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.profileCreate,
    { scope, label },
    { timeoutMs: 15_000 }
  )
}

export function deleteLocalBrowserProfile(profileId: string) {
  return callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.profileDelete,
    { profileId },
    { timeoutMs: 15_000 }
  )
}

export function detectLocalBrowserProfiles() {
  return callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.profileDetectBrowsers,
    undefined,
    { timeoutMs: 15_000 }
  )
}

export function importLocalBrowserProfile(input: {
  profileId: string
  browserFamily: string
  browserProfile?: string
}) {
  return callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.profileImportFromBrowser,
    input,
    { timeoutMs: 30_000 }
  )
}

export function clearLocalDefaultBrowserCookies() {
  return callRuntimeOrpc(
    LOCAL_RUNTIME_TARGET,
    (client) => client.browser.profileClearDefaultCookies,
    undefined,
    { timeoutMs: 15_000 }
  )
}

// Why: the picker path is selected and consumed in main; the renderer receives
// only an import result until an opaque file-handle bytes lifecycle exists.
export function importLocalBrowserCookieFile(profileId: string) {
  return callShellOrpc((client) => client.shell.browser.importCookies, { profileId })
}
