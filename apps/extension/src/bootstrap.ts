import {
  mountExtensionClient,
  mountExtensionConnecting,
  mountExtensionUnavailable
} from '@yiru/client/extension-bootstrap'

import {
  classifyUnavailableError,
  classifyUnavailableResponse,
  isExtensionBootstrapResponse
} from './bootstrap-response'
import { createBrowserCapabilities } from './bootstrap/browser-capabilities'
import { verifyRuntimeHealth } from './bootstrap/health'
import { requestRuntimeLoopbackAccess } from './bootstrap/loopback-access'

export async function mountExtensionSurface(surface: 'side-panel' | 'workspace'): Promise<void> {
  Reflect.set(globalThis, '__YIRU_EXTENSION_SURFACE__', surface)
  const browserWindowId = await chrome.windows.getCurrent().then(
    (browserWindow) => browserWindow.id ?? null,
    () => null
  )
  if (browserWindowId !== null) {
    // Why: the source-only client cannot read Chrome globals. Supplying the exact
    // window fact lets its two extension surfaces coordinate without guessing.
    Reflect.set(globalThis, '__YIRU_BROWSER_WINDOW_ID__', browserWindowId)
  }
  const unmountConnecting = mountExtensionConnecting()
  try {
    const response: unknown = await chrome.runtime.sendMessage({ type: 'bootstrap' })
    if (!isExtensionBootstrapResponse(response) || !response.ok) {
      unmountConnecting()
      mountExtensionUnavailable(classifyUnavailableResponse(response))
      return
    }
    try {
      await verifyRuntimeHealth(response.result)
    } catch (error) {
      const reason = classifyUnavailableError(error)
      unmountConnecting()
      mountExtensionUnavailable(
        reason,
        reason === 'loopback-blocked'
          ? { requestLoopbackAccess: () => requestRuntimeLoopbackAccess(response.result) }
          : {}
      )
      return
    }
    unmountConnecting()
    await mountExtensionClient(response.result, {
      browserCapabilities: createBrowserCapabilities(response.result),
      openExternalUrl: async (target) => {
        const navigationResponse: unknown = await chrome.runtime.sendMessage({
          ...target,
          type: 'open-external-url'
        })
        if (
          typeof navigationResponse !== 'object' ||
          navigationResponse === null ||
          Reflect.get(navigationResponse, 'ok') !== true
        ) {
          throw new Error('extension_browser_action_failed')
        }
      },
      openPage: (page) => {
        void chrome.runtime.sendMessage({ page, type: 'open-page' })
      },
      openWorkspace: (target) => {
        void chrome.runtime.sendMessage({ target, type: 'open-workspace' })
      },
      publishAgentAttention: (count) => {
        void chrome.runtime.sendMessage({ count, type: 'agent-attention' })
      },
      readActivePageUrl: async () => {
        const stored: unknown = await chrome.storage.local.get('contextAwarenessEnabled')
        if (
          typeof stored !== 'object' ||
          stored === null ||
          Reflect.get(stored, 'contextAwarenessEnabled') !== true
        ) {
          return null
        }
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
        return tabs[0]?.url ?? null
      },
      surface
    })
  } catch (error) {
    unmountConnecting()
    mountExtensionUnavailable(classifyUnavailableError(error))
  }
}
