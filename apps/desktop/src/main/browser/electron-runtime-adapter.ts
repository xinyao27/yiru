import type {
  BrowserAnnotationViewportInput,
  BrowserDownloadCancelInput,
  BrowserGrabAwaitInput,
  BrowserGrabCaptureInput,
  BrowserGrabSetModeInput,
  BrowserPageIdInput,
  BrowserPageRegisterInput,
  BrowserPageUnregisterInput,
  BrowserViewportOverrideInput
} from '@yiru/runtime-protocol/contract'
import type { RuntimeBrowserShellAdapter } from '~main/runtime/yiru-runtime-browser'

import { browserCertificateTrustController, browserManager } from './manager'
import {
  registerBrowserPage,
  setActiveBrowserPage,
  unregisterBrowserPage,
  waitForTabRegistration,
  waitForWorktreeTabRegistration
} from './page/control'

function getAuthorizedPage(input: BrowserPageIdInput, shellConnectionId: string | undefined) {
  return shellConnectionId
    ? browserManager.getAuthorizedPage(input.browserPageId, shellConnectionId)
    : null
}

export const electronRuntimeBrowserShellAdapter: RuntimeBrowserShellAdapter = {
  browserPageRegister: async (input: BrowserPageRegisterInput, shellConnectionId) => ({
    accepted: shellConnectionId ? await registerBrowserPage(input, shellConnectionId) : false
  }),
  browserPageUnregister: (input: BrowserPageUnregisterInput, shellConnectionId) => ({
    accepted: shellConnectionId ? unregisterBrowserPage(input, shellConnectionId) : false
  }),
  browserPageSetActive: (input: BrowserPageIdInput, shellConnectionId) => ({
    accepted: shellConnectionId
      ? setActiveBrowserPage(input.browserPageId, shellConnectionId)
      : false
  }),
  browserOpenDevTools: async (input: BrowserPageIdInput, shellConnectionId) => {
    if (!getAuthorizedPage(input, shellConnectionId)) {
      return { accepted: false }
    }
    return { accepted: await browserManager.openDevTools(input.browserPageId) }
  },
  browserSetViewportOverride: async (input: BrowserViewportOverrideInput, shellConnectionId) => {
    if (!getAuthorizedPage(input, shellConnectionId)) {
      return { accepted: false }
    }
    return {
      accepted: await browserManager.setViewportOverride(input.browserPageId, input.override)
    }
  },
  browserSetAnnotationViewport: async (
    input: BrowserAnnotationViewportInput,
    shellConnectionId
  ) => {
    if (!getAuthorizedPage(input, shellConnectionId)) {
      return { accepted: false }
    }
    return {
      accepted: await browserManager.setAnnotationViewportBridge(input.browserPageId, {
        emitViewport: input.emitViewport,
        enabled: input.enabled,
        markers: input.markers,
        token: input.token
      })
    }
  },
  browserCancelDownload: (input: BrowserDownloadCancelInput, shellConnectionId) => ({
    accepted: shellConnectionId
      ? browserManager.cancelDownload({ downloadId: input.downloadId, shellConnectionId })
      : false
  }),
  browserSetGrabMode: async (input: BrowserGrabSetModeInput, shellConnectionId) => {
    const page = getAuthorizedPage(input, shellConnectionId)
    if (!page) {
      return { ok: false, reason: shellConnectionId ? 'not-ready' : 'not-authorized' }
    }
    const accepted = await browserManager.setGrabMode(input.browserPageId, input.enabled, page)
    return accepted ? { ok: true } : { ok: false, reason: 'not-ready' }
  },
  browserAwaitGrabSelection: (input: BrowserGrabAwaitInput, shellConnectionId) => {
    const page = getAuthorizedPage(input, shellConnectionId)
    if (!page) {
      return Promise.resolve({
        kind: 'error',
        opId: input.opId,
        reason: shellConnectionId ? 'Guest not ready' : 'Not authorized'
      })
    }
    return browserManager.awaitGrabSelection(input.browserPageId, input.opId, page)
  },
  browserCancelGrab: (input: BrowserPageIdInput, shellConnectionId) => {
    if (!getAuthorizedPage(input, shellConnectionId)) {
      return { accepted: false }
    }
    browserManager.cancelGrabOp(input.browserPageId, 'user')
    return { accepted: true }
  },
  browserCaptureSelection: async (input: BrowserGrabCaptureInput, shellConnectionId) => {
    const page = getAuthorizedPage(input, shellConnectionId)
    if (!page) {
      return { ok: false, reason: shellConnectionId ? 'Guest not ready' : 'Not authorized' }
    }
    const screenshot = await browserManager.captureSelectionScreenshot(
      input.browserPageId,
      input.rect,
      page
    )
    return screenshot
      ? { ok: true, screenshot }
      : { ok: false, reason: 'Screenshot capture failed' }
  },
  browserExtractHover: async (input: BrowserPageIdInput, shellConnectionId) => {
    const page = getAuthorizedPage(input, shellConnectionId)
    if (!page) {
      return { ok: false, reason: shellConnectionId ? 'Guest not ready' : 'Not authorized' }
    }
    const payload = await browserManager.extractHoverPayload(input.browserPageId, page)
    return payload ? { ok: true, payload } : { ok: false, reason: 'No element hovered' }
  },
  browserProceedCertificate: (browserPageId, challengeId) =>
    browserCertificateTrustController.proceed(browserPageId, challengeId),
  waitForTabRegistration,
  waitForWorktreeTabRegistration
}
