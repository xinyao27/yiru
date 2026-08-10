import type {
  BrowserClipboardWriteInput,
  BrowserCookieDeleteInput,
  BrowserCookieGetInput,
  BrowserCookieSetInput,
  BrowserDialogAcceptInput,
  BrowserGeolocationInput,
  BrowserInterceptEnableInput,
  BrowserMouseButtonInput,
  BrowserMouseClickInput,
  BrowserMouseCoordinatesInput,
  BrowserMouseWheelInput,
  BrowserSetCredentialsInput,
  BrowserSetDeviceInput,
  BrowserSetHeadersInput,
  BrowserSetMediaInput,
  BrowserSetOfflineInput,
  BrowserStorageKeyInput,
  BrowserStorageKeyValueInput,
  BrowserTargetInput,
  BrowserViewportInput
} from '@yiru/runtime-protocol/contract'

import { assertRpcClipboardTextWriteWithinLimit } from '../clipboard-text-validation'
import type { RpcContext } from '../core'

export const handleBrowserCookieGet = (
  params: BrowserCookieGetInput,
  { browserCommands }: RpcContext
) => browserCommands.browserCookieGet(params)

export const handleBrowserCookieSet = (
  params: BrowserCookieSetInput,
  { browserCommands }: RpcContext
) => browserCommands.browserCookieSet(params)

export const handleBrowserCookieDelete = (
  params: BrowserCookieDeleteInput,
  { browserCommands }: RpcContext
) => browserCommands.browserCookieDelete(params)

export const handleBrowserViewport = (
  params: BrowserViewportInput,
  { browserCommands }: RpcContext
) => browserCommands.browserSetViewport(params)

export const handleBrowserGeolocation = (
  params: BrowserGeolocationInput,
  { browserCommands }: RpcContext
) => browserCommands.browserSetGeolocation(params)

export const handleBrowserInterceptEnable = (
  params: BrowserInterceptEnableInput,
  { browserCommands }: RpcContext
) => browserCommands.browserInterceptEnable(params)

export const handleBrowserInterceptDisable = (
  params: BrowserTargetInput,
  { browserCommands }: RpcContext
) => browserCommands.browserInterceptDisable(params)

export const handleBrowserInterceptList = (
  params: BrowserTargetInput,
  { browserCommands }: RpcContext
) => browserCommands.browserInterceptList(params)

export const handleBrowserMouseMove = (
  params: BrowserMouseCoordinatesInput,
  { browserCommands }: RpcContext
) => browserCommands.browserMouseMove(params)

export const handleBrowserMouseDown = (
  params: BrowserMouseButtonInput,
  { browserCommands }: RpcContext
) => browserCommands.browserMouseDown(params)

export const handleBrowserMouseClick = (
  params: BrowserMouseClickInput,
  { browserCommands }: RpcContext
) => browserCommands.browserMouseClick(params)

export const handleBrowserMouseUp = (
  params: BrowserMouseButtonInput,
  { browserCommands }: RpcContext
) => browserCommands.browserMouseUp(params)

export const handleBrowserMouseWheel = (
  params: BrowserMouseWheelInput,
  { browserCommands }: RpcContext
) => browserCommands.browserMouseWheel(params)

export const handleBrowserSetDevice = (
  params: BrowserSetDeviceInput,
  { browserCommands }: RpcContext
) => browserCommands.browserSetDevice(params)

export const handleBrowserSetOffline = (
  params: BrowserSetOfflineInput,
  { browserCommands }: RpcContext
) => browserCommands.browserSetOffline(params)

export const handleBrowserSetHeaders = (
  params: BrowserSetHeadersInput,
  { browserCommands }: RpcContext
) => browserCommands.browserSetHeaders(params)

export const handleBrowserSetCredentials = (
  params: BrowserSetCredentialsInput,
  { browserCommands }: RpcContext
) => browserCommands.browserSetCredentials(params)

export const handleBrowserSetMedia = (
  params: BrowserSetMediaInput,
  { browserCommands }: RpcContext
) => browserCommands.browserSetMedia(params)

export const handleBrowserClipboardRead = (
  params: BrowserTargetInput,
  { browserCommands }: RpcContext
) => browserCommands.browserClipboardRead(params)

export const handleBrowserClipboardWrite = async (
  params: BrowserClipboardWriteInput,
  { browserCommands }: RpcContext
) => {
  await assertRpcClipboardTextWriteWithinLimit(params.text)
  return browserCommands.browserClipboardWrite(params)
}

export const handleBrowserDialogAccept = (
  params: BrowserDialogAcceptInput,
  { browserCommands }: RpcContext
) => browserCommands.browserDialogAccept(params)

export const handleBrowserDialogDismiss = (
  params: BrowserTargetInput,
  { browserCommands }: RpcContext
) => browserCommands.browserDialogDismiss(params)

export const handleBrowserStorageLocalGet = (
  params: BrowserStorageKeyInput,
  { browserCommands }: RpcContext
) => browserCommands.browserStorageLocalGet(params)

export const handleBrowserStorageLocalSet = (
  params: BrowserStorageKeyValueInput,
  { browserCommands }: RpcContext
) => browserCommands.browserStorageLocalSet(params)

export const handleBrowserStorageLocalClear = (
  params: BrowserTargetInput,
  { browserCommands }: RpcContext
) => browserCommands.browserStorageLocalClear(params)

export const handleBrowserStorageSessionGet = (
  params: BrowserStorageKeyInput,
  { browserCommands }: RpcContext
) => browserCommands.browserStorageSessionGet(params)

export const handleBrowserStorageSessionSet = (
  params: BrowserStorageKeyValueInput,
  { browserCommands }: RpcContext
) => browserCommands.browserStorageSessionSet(params)

export const handleBrowserStorageSessionClear = (
  params: BrowserTargetInput,
  { browserCommands }: RpcContext
) => browserCommands.browserStorageSessionClear(params)
