import { z } from 'zod'

import {
  BrowserTarget,
  OptionalFiniteNumber
} from '../../../../shared/runtime-method-contracts/runtime-method-params'
import { defineMethod, type RpcMethod } from '../core'
import { assertRpcClipboardTextWriteWithinLimit } from '../rpc-clipboard-text-validation'
import {
  ClipboardWrite,
  CookieDelete,
  CookieGet,
  CookieSet,
  DialogAccept,
  Geolocation,
  InterceptEnable,
  MouseButton,
  MouseWheel,
  MouseXY,
  SetCredentials,
  SetDevice,
  SetHeaders,
  SetMedia,
  SetOffline,
  StorageKey,
  StorageKeyValue,
  Viewport
} from './browser-schemas'

const MouseModifiers = z
  .unknown()
  .transform((v) => (Array.isArray(v) ? v : undefined))
  .pipe(z.union([z.array(z.enum(['cmd', 'ctrl', 'alt', 'shift'])), z.undefined()]))
  .optional()

const MouseClick = MouseXY.merge(MouseButton).extend({
  radius: OptionalFiniteNumber,
  modifiers: MouseModifiers
})

export const BROWSER_EXTRA_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'browser.cookie.get',
    params: CookieGet,
    handler: async (params, { browserCommands }) => browserCommands.browserCookieGet(params)
  }),
  defineMethod({
    name: 'browser.cookie.set',
    params: CookieSet,
    handler: async (params, { browserCommands }) => browserCommands.browserCookieSet(params)
  }),
  defineMethod({
    name: 'browser.cookie.delete',
    params: CookieDelete,
    handler: async (params, { browserCommands }) => browserCommands.browserCookieDelete(params)
  }),
  defineMethod({
    name: 'browser.viewport',
    mobile: true,
    params: Viewport,
    handler: async (params, { browserCommands }) => browserCommands.browserSetViewport(params)
  }),
  defineMethod({
    name: 'browser.geolocation',
    params: Geolocation,
    handler: async (params, { browserCommands }) => browserCommands.browserSetGeolocation(params)
  }),
  defineMethod({
    name: 'browser.intercept.enable',
    params: InterceptEnable,
    handler: async (params, { browserCommands }) => browserCommands.browserInterceptEnable(params)
  }),
  defineMethod({
    name: 'browser.intercept.disable',
    params: BrowserTarget,
    handler: async (params, { browserCommands }) => browserCommands.browserInterceptDisable(params)
  }),
  defineMethod({
    name: 'browser.intercept.list',
    params: BrowserTarget,
    handler: async (params, { browserCommands }) => browserCommands.browserInterceptList(params)
  }),
  defineMethod({
    name: 'browser.mouseMove',
    mobile: true,
    params: MouseXY,
    handler: async (params, { browserCommands }) => browserCommands.browserMouseMove(params)
  }),
  defineMethod({
    name: 'browser.mouseDown',
    mobile: true,
    params: MouseButton,
    handler: async (params, { browserCommands }) => browserCommands.browserMouseDown(params)
  }),
  defineMethod({
    name: 'browser.mouseClick',
    mobile: true,
    params: MouseClick,
    handler: async (params, { browserCommands }) => browserCommands.browserMouseClick(params)
  }),
  defineMethod({
    name: 'browser.mouseUp',
    mobile: true,
    params: MouseButton,
    handler: async (params, { browserCommands }) => browserCommands.browserMouseUp(params)
  }),
  defineMethod({
    name: 'browser.mouseWheel',
    mobile: true,
    params: MouseWheel,
    handler: async (params, { browserCommands }) => browserCommands.browserMouseWheel(params)
  }),
  defineMethod({
    name: 'browser.setDevice',
    params: SetDevice,
    handler: async (params, { browserCommands }) => browserCommands.browserSetDevice(params)
  }),
  defineMethod({
    name: 'browser.setOffline',
    params: SetOffline,
    handler: async (params, { browserCommands }) => browserCommands.browserSetOffline(params)
  }),
  defineMethod({
    name: 'browser.setHeaders',
    params: SetHeaders,
    handler: async (params, { browserCommands }) => browserCommands.browserSetHeaders(params)
  }),
  defineMethod({
    name: 'browser.setCredentials',
    params: SetCredentials,
    handler: async (params, { browserCommands }) => browserCommands.browserSetCredentials(params)
  }),
  defineMethod({
    name: 'browser.setMedia',
    params: SetMedia,
    handler: async (params, { browserCommands }) => browserCommands.browserSetMedia(params)
  }),
  defineMethod({
    name: 'browser.clipboardRead',
    params: BrowserTarget,
    handler: async (params, { browserCommands }) => browserCommands.browserClipboardRead(params)
  }),
  defineMethod({
    name: 'browser.clipboardWrite',
    params: ClipboardWrite,
    handler: async (params, { browserCommands }) => {
      await assertRpcClipboardTextWriteWithinLimit(params.text)
      return browserCommands.browserClipboardWrite(params)
    }
  }),
  defineMethod({
    name: 'browser.dialogAccept',
    mobile: true,
    params: DialogAccept,
    handler: async (params, { browserCommands }) => browserCommands.browserDialogAccept(params)
  }),
  defineMethod({
    name: 'browser.dialogDismiss',
    mobile: true,
    params: BrowserTarget,
    handler: async (params, { browserCommands }) => browserCommands.browserDialogDismiss(params)
  }),
  defineMethod({
    name: 'browser.storage.local.get',
    params: StorageKey,
    handler: async (params, { browserCommands }) => browserCommands.browserStorageLocalGet(params)
  }),
  defineMethod({
    name: 'browser.storage.local.set',
    params: StorageKeyValue,
    handler: async (params, { browserCommands }) => browserCommands.browserStorageLocalSet(params)
  }),
  defineMethod({
    name: 'browser.storage.local.clear',
    params: BrowserTarget,
    handler: async (params, { browserCommands }) => browserCommands.browserStorageLocalClear(params)
  }),
  defineMethod({
    name: 'browser.storage.session.get',
    params: StorageKey,
    handler: async (params, { browserCommands }) => browserCommands.browserStorageSessionGet(params)
  }),
  defineMethod({
    name: 'browser.storage.session.set',
    params: StorageKeyValue,
    handler: async (params, { browserCommands }) => browserCommands.browserStorageSessionSet(params)
  }),
  defineMethod({
    name: 'browser.storage.session.clear',
    params: BrowserTarget,
    handler: async (params, { browserCommands }) =>
      browserCommands.browserStorageSessionClear(params)
  })
]
