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
import { buildGuestOverlayScript } from '~main/browser/grab-guest-script'
import { clampGrabPayload } from '~main/browser/grab-payload'
import { captureSelectionScreenshot } from '~main/browser/grab-screenshot'
import { BrowserGrabSessionController } from '~main/browser/grab-session-controller'
import { evaluateBrowserPage, evaluateBrowserPageIsolated } from '~main/browser/page/evaluation'
import type { BrowserPageHandle } from '~main/browser/page/handle'
import type {
  RuntimeBrowserCommandHost,
  RuntimeBrowserShellAdapter
} from '~main/runtime/yiru-runtime-browser'
import { buildBrowserAnnotationViewportBridgeScript } from '~shared/browser/annotation-viewport-bridge'

type BrowserShellHost = Pick<
  RuntimeBrowserCommandHost,
  'getAgentBrowserBridge' | 'getBrowserBackend'
>

function getAuthorizedPage(
  host: BrowserShellHost,
  browserPageId: string,
  shellConnectionId: string | undefined
): BrowserPageHandle | null {
  if (!shellConnectionId) {
    return null
  }
  const page = host.getAgentBrowserBridge()?.getPage(browserPageId) ?? null
  return page?.identity.shellConnectionId === shellConnectionId ? page : null
}

async function setViewportOverride(
  page: BrowserPageHandle,
  input: BrowserViewportOverrideInput
): Promise<boolean> {
  const cdp = page.acquireCdp()
  try {
    if (input.override) {
      await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
        deviceScaleFactor: input.override.deviceScaleFactor,
        height: input.override.height,
        mobile: input.override.mobile,
        width: input.override.width
      })
      await cdp.sendCommand('Emulation.setTouchEmulationEnabled', {
        enabled: input.override.mobile,
        maxTouchPoints: input.override.mobile ? 5 : 0
      })
    } else {
      await cdp.sendCommand('Emulation.clearDeviceMetricsOverride')
      await cdp.sendCommand('Emulation.setTouchEmulationEnabled', {
        enabled: false,
        maxTouchPoints: 0
      })
    }
    return true
  } catch {
    return false
  } finally {
    cdp.release()
  }
}

export function createNodeRuntimeBrowserShellAdapter(
  host: BrowserShellHost
): RuntimeBrowserShellAdapter {
  const grabSessions = new BrowserGrabSessionController()

  // Why: Chrome pages retain the socket-derived shell identity supplied at
  // creation. Every privileged control rechecks it; the host never invents an owner.
  return {
    browserPageRegister: async (input: BrowserPageRegisterInput, shellConnectionId) => {
      const page = getAuthorizedPage(host, input.browserPageId, shellConnectionId)
      const worktreeId = host.getAgentBrowserBridge()?.getWorktreeIdForTab(input.browserPageId)
      return {
        accepted:
          page?.identity.backendPageId === input.backendPageId && worktreeId === input.worktreeId
      }
    },
    browserPageUnregister: (input: BrowserPageUnregisterInput, shellConnectionId) => {
      const page = getAuthorizedPage(host, input.browserPageId, shellConnectionId)
      if (page?.identity.backendPageId !== input.expectedBackendPageId) {
        return { accepted: false }
      }
      void host
        .getBrowserBackend()
        ?.closeTab(input.browserPageId)
        .catch(() => {})
      return { accepted: true }
    },
    browserPageSetActive: (input: BrowserPageIdInput, shellConnectionId) => {
      const page = getAuthorizedPage(host, input.browserPageId, shellConnectionId)
      const bridge = host.getAgentBrowserBridge()
      if (!page || !bridge) {
        return { accepted: false }
      }
      bridge.onTabChanged(input.browserPageId, bridge.getWorktreeIdForTab(input.browserPageId))
      return { accepted: true }
    },
    browserOpenDevTools: async (input: BrowserPageIdInput, shellConnectionId) => {
      const page = getAuthorizedPage(host, input.browserPageId, shellConnectionId)
      if (!page?.openDevTools) {
        return { accepted: false }
      }
      page.openDevTools()
      return { accepted: true }
    },
    browserSetViewportOverride: async (input: BrowserViewportOverrideInput, shellConnectionId) => {
      const page = getAuthorizedPage(host, input.browserPageId, shellConnectionId)
      return { accepted: page ? await setViewportOverride(page, input) : false }
    },
    browserSetAnnotationViewport: async (
      input: BrowserAnnotationViewportInput,
      shellConnectionId
    ) => {
      const page = getAuthorizedPage(host, input.browserPageId, shellConnectionId)
      if (!page) {
        return { accepted: false }
      }
      try {
        await evaluateBrowserPageIsolated(
          page,
          buildBrowserAnnotationViewportBridgeScript({
            emitViewport: input.emitViewport,
            enabled: input.enabled,
            markers: input.markers,
            token: input.token
          })
        )
        return { accepted: true }
      } catch {
        return { accepted: false }
      }
    },
    browserCancelDownload: (
      _input: BrowserDownloadCancelInput,
      _shellConnectionId: string | undefined
    ) => ({ accepted: false }),
    browserSetGrabMode: async (input: BrowserGrabSetModeInput, shellConnectionId) => {
      const page = getAuthorizedPage(host, input.browserPageId, shellConnectionId)
      if (!page) {
        return { ok: false, reason: shellConnectionId ? 'not-ready' : 'not-authorized' }
      }
      if (!input.enabled) {
        grabSessions.cancelGrabOp(input.browserPageId, 'user')
        return { ok: true }
      }
      try {
        await evaluateBrowserPage(page, buildGuestOverlayScript('arm'))
        return { ok: true }
      } catch {
        return { ok: false, reason: 'not-ready' }
      }
    },
    browserAwaitGrabSelection: (input: BrowserGrabAwaitInput, shellConnectionId) => {
      const page = getAuthorizedPage(host, input.browserPageId, shellConnectionId)
      return page
        ? grabSessions.awaitGrabSelection(input.browserPageId, input.opId, page)
        : Promise.resolve({
            kind: 'error' as const,
            opId: input.opId,
            reason: shellConnectionId ? 'Guest not ready' : 'Not authorized'
          })
    },
    browserCancelGrab: (input: BrowserPageIdInput, shellConnectionId) => {
      if (!getAuthorizedPage(host, input.browserPageId, shellConnectionId)) {
        return { accepted: false }
      }
      grabSessions.cancelGrabOp(input.browserPageId, 'user')
      return { accepted: true }
    },
    browserCaptureSelection: async (input: BrowserGrabCaptureInput, shellConnectionId) => {
      const page = getAuthorizedPage(host, input.browserPageId, shellConnectionId)
      if (!page) {
        return { ok: false, reason: shellConnectionId ? 'Guest not ready' : 'Not authorized' }
      }
      const screenshot = await captureSelectionScreenshot(input.rect, page)
      return screenshot
        ? { ok: true, screenshot }
        : { ok: false, reason: 'Screenshot capture failed' }
    },
    browserExtractHover: async (input: BrowserPageIdInput, shellConnectionId) => {
      const page = getAuthorizedPage(host, input.browserPageId, shellConnectionId)
      if (!page) {
        return { ok: false, reason: shellConnectionId ? 'Guest not ready' : 'Not authorized' }
      }
      try {
        const payload = clampGrabPayload(
          await evaluateBrowserPage(page, buildGuestOverlayScript('extractHover'))
        )
        return payload ? { ok: true, payload } : { ok: false, reason: 'No element hovered' }
      } catch {
        return { ok: false, reason: 'No element hovered' }
      }
    },
    browserProceedCertificate: () => ({ ok: false, reason: 'missing' }),
    waitForTabRegistration: async (browserPageId) => {
      if (!host.getAgentBrowserBridge()?.getPage(browserPageId)) {
        throw new Error('Browser tab is not registered')
      }
    },
    waitForWorktreeTabRegistration: async (worktreeId) => {
      if (!host.getAgentBrowserBridge()?.getRegisteredTabs(worktreeId).size) {
        throw new Error('Browser worktree has no registered tab')
      }
    }
  }
}
