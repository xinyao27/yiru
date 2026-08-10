import { handleBrowserDownload } from '~main/runtime/rpc/methods/browser-core'
import {
  handleBrowserClipboardRead,
  handleBrowserClipboardWrite,
  handleBrowserCookieDelete,
  handleBrowserCookieGet,
  handleBrowserCookieSet,
  handleBrowserDialogAccept,
  handleBrowserDialogDismiss,
  handleBrowserGeolocation,
  handleBrowserInterceptDisable,
  handleBrowserInterceptEnable,
  handleBrowserInterceptList,
  handleBrowserSetCredentials,
  handleBrowserSetDevice,
  handleBrowserSetHeaders,
  handleBrowserSetMedia,
  handleBrowserSetOffline,
  handleBrowserStorageLocalClear,
  handleBrowserStorageLocalGet,
  handleBrowserStorageLocalSet,
  handleBrowserStorageSessionClear,
  handleBrowserStorageSessionGet,
  handleBrowserStorageSessionSet,
  handleBrowserViewport
} from '~main/runtime/rpc/methods/browser-extras'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: environment/session-control leaves (cookies, network interception, device
// emulation, dialogs, storage) — split out of browser.ts, direct-wired only.
// `dialogAccept`/`dialogDismiss` used to keep a legacy twin for mobile's bare-string
// channel; 切片 83 moved that caller onto `callRuntimeOrpc`.
export function browserNetworkLeaves() {
  return {
    cookie: {
      get: runtimeImplementation.browser.cookie.get.handler(
        wireRuntimeMethod('browser.cookie.get', handleBrowserCookieGet)
      ),
      set: runtimeImplementation.browser.cookie.set.handler(
        wireRuntimeMethod('browser.cookie.set', handleBrowserCookieSet)
      ),
      delete: runtimeImplementation.browser.cookie.delete.handler(
        wireRuntimeMethod('browser.cookie.delete', handleBrowserCookieDelete)
      )
    },
    viewport: runtimeImplementation.browser.viewport.handler(
      wireRuntimeMethod('browser.viewport', handleBrowserViewport)
    ),
    geolocation: runtimeImplementation.browser.geolocation.handler(
      wireRuntimeMethod('browser.geolocation', handleBrowserGeolocation)
    ),
    intercept: {
      enable: runtimeImplementation.browser.intercept.enable.handler(
        wireRuntimeMethod('browser.intercept.enable', handleBrowserInterceptEnable)
      ),
      disable: runtimeImplementation.browser.intercept.disable.handler(
        wireRuntimeMethod('browser.intercept.disable', handleBrowserInterceptDisable)
      ),
      list: runtimeImplementation.browser.intercept.list.handler(
        wireRuntimeMethod('browser.intercept.list', handleBrowserInterceptList)
      )
    },
    setDevice: runtimeImplementation.browser.setDevice.handler(
      wireRuntimeMethod('browser.setDevice', handleBrowserSetDevice)
    ),
    setOffline: runtimeImplementation.browser.setOffline.handler(
      wireRuntimeMethod('browser.setOffline', handleBrowserSetOffline)
    ),
    setHeaders: runtimeImplementation.browser.setHeaders.handler(
      wireRuntimeMethod('browser.setHeaders', handleBrowserSetHeaders)
    ),
    setCredentials: runtimeImplementation.browser.setCredentials.handler(
      wireRuntimeMethod('browser.setCredentials', handleBrowserSetCredentials)
    ),
    setMedia: runtimeImplementation.browser.setMedia.handler(
      wireRuntimeMethod('browser.setMedia', handleBrowserSetMedia)
    ),
    clipboardRead: runtimeImplementation.browser.clipboardRead.handler(
      wireRuntimeMethod('browser.clipboardRead', handleBrowserClipboardRead)
    ),
    clipboardWrite: runtimeImplementation.browser.clipboardWrite.handler(
      wireRuntimeMethod('browser.clipboardWrite', handleBrowserClipboardWrite)
    ),
    dialogAccept: runtimeImplementation.browser.dialogAccept.handler(
      wireRuntimeMethod('browser.dialogAccept', handleBrowserDialogAccept)
    ),
    dialogDismiss: runtimeImplementation.browser.dialogDismiss.handler(
      wireRuntimeMethod('browser.dialogDismiss', handleBrowserDialogDismiss)
    ),
    download: runtimeImplementation.browser.download.handler(
      wireRuntimeMethod('browser.download', handleBrowserDownload)
    ),
    storage: {
      local: {
        get: runtimeImplementation.browser.storage.local.get.handler(
          wireRuntimeMethod('browser.storage.local.get', handleBrowserStorageLocalGet)
        ),
        set: runtimeImplementation.browser.storage.local.set.handler(
          wireRuntimeMethod('browser.storage.local.set', handleBrowserStorageLocalSet)
        ),
        clear: runtimeImplementation.browser.storage.local.clear.handler(
          wireRuntimeMethod('browser.storage.local.clear', handleBrowserStorageLocalClear)
        )
      },
      session: {
        get: runtimeImplementation.browser.storage.session.get.handler(
          wireRuntimeMethod('browser.storage.session.get', handleBrowserStorageSessionGet)
        ),
        set: runtimeImplementation.browser.storage.session.set.handler(
          wireRuntimeMethod('browser.storage.session.set', handleBrowserStorageSessionSet)
        ),
        clear: runtimeImplementation.browser.storage.session.clear.handler(
          wireRuntimeMethod('browser.storage.session.clear', handleBrowserStorageSessionClear)
        )
      }
    }
  } as const
}
