import { optionalString, requiredString } from './command-value'
import {
  disableInterception,
  enableInterception,
  listInterceptedRequests,
  registerBrowserFetchListeners,
  setCredentials
} from './environment-fetch'
import {
  clearStorage,
  deleteCookie,
  getCookies,
  getStorage,
  handleDialog,
  readClipboard,
  registerBrowserPageEnvironmentListeners,
  setCookie,
  setDevice,
  setGeolocation,
  setHeaders,
  setMedia,
  setOffline,
  setStorage,
  setViewport,
  writeClipboard
} from './environment-page'
import { readBrowserCommandInput, resolveBrowserTab } from './target'

export function registerBrowserEnvironmentListeners(): void {
  registerBrowserFetchListeners()
  registerBrowserPageEnvironmentListeners()
}

export async function executeBrowserEnvironment(
  method: string,
  rawInput: unknown
): Promise<unknown> {
  const input = readBrowserCommandInput(rawInput)
  const tab = await resolveBrowserTab(input)
  if (tab.id === undefined) {
    throw new Error('browser_tab_id_missing')
  }
  const tabId = tab.id
  switch (method) {
    case 'browser.cookie.get':
      return getCookies(tabId, tab, input)
    case 'browser.cookie.set':
      return setCookie(tabId, tab, input)
    case 'browser.cookie.delete':
      return deleteCookie(tabId, tab, input)
    case 'browser.viewport':
      return setViewport(tabId, input)
    case 'browser.geolocation':
      return setGeolocation(tabId, input)
    case 'browser.intercept.enable':
      return enableInterception(tabId, input)
    case 'browser.intercept.disable':
      return disableInterception(tabId)
    case 'browser.intercept.list':
      return listInterceptedRequests(tabId)
    case 'browser.setDevice':
      return setDevice(tabId, input)
    case 'browser.setOffline':
      return setOffline(tabId, input)
    case 'browser.setHeaders':
      return setHeaders(tabId, input)
    case 'browser.setCredentials':
      return setCredentials(tabId, input)
    case 'browser.setMedia':
      return setMedia(tabId, input)
    case 'browser.clipboardRead':
      return readClipboard(tabId)
    case 'browser.clipboardWrite':
      return writeClipboard(tabId, input)
    case 'browser.dialogAccept':
      return handleDialog(tabId, true, optionalString(input, 'text'))
    case 'browser.dialogDismiss':
      return handleDialog(tabId, false, null)
    case 'browser.storage.local.get':
      return getStorage(tabId, 'localStorage', requiredString(input, 'key'))
    case 'browser.storage.local.set':
      return setStorage(tabId, 'localStorage', input)
    case 'browser.storage.local.clear':
      return clearStorage(tabId, 'localStorage')
    case 'browser.storage.session.get':
      return getStorage(tabId, 'sessionStorage', requiredString(input, 'key'))
    case 'browser.storage.session.set':
      return setStorage(tabId, 'sessionStorage', input)
    case 'browser.storage.session.clear':
      return clearStorage(tabId, 'sessionStorage')
  }
  throw new Error(`browser_environment_command_unsupported:${method}`)
}
