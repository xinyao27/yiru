import type {
  BrowserProfileCreateInput,
  BrowserProfileDeleteInput,
  BrowserProfileImportInput,
  BrowserTabCloseInput,
  BrowserTabCreateInput,
  BrowserTabCurrentInput,
  BrowserTabListInput,
  BrowserTabProfileCloneInput,
  BrowserTabSetProfileInput,
  BrowserTabShowInput,
  BrowserTabSwitchInput
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

// Why: split out of browser-core.ts to stay under the 300-line ceiling — the seam is
// real, tabs and profiles are the browser's identity/session surface (which logged-in
// profile a page runs as), separate from page navigation and interaction. Direct-wired
// only (orpc/router-direct/browser-tabs.ts) — same as browser-core.ts's own leaves
// since 切片 83 moved mobile off the bare channel.
export const handleBrowserTabList = (
  params: BrowserTabListInput,
  { browserCommands }: RpcContext
) => browserCommands.browserTabList(params)

export const handleBrowserTabShow = (
  params: BrowserTabShowInput,
  { browserCommands }: RpcContext
) => browserCommands.browserTabShow(params)

export const handleBrowserTabCurrent = (
  params: BrowserTabCurrentInput,
  { browserCommands }: RpcContext
) => browserCommands.browserTabCurrent(params)

export const handleBrowserTabSwitch = (
  params: BrowserTabSwitchInput,
  { browserCommands }: RpcContext
) => browserCommands.browserTabSwitch(params)

export const handleBrowserTabCreate = (
  params: BrowserTabCreateInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserTabCreate(params, { shellConnectionId })

export const handleBrowserTabSetProfile = (
  params: BrowserTabSetProfileInput,
  { browserCommands }: RpcContext
) => browserCommands.browserTabSetProfile(params)

export const handleBrowserTabProfileShow = (
  params: BrowserTabShowInput,
  { browserCommands }: RpcContext
) => browserCommands.browserTabProfileShow(params)

export const handleBrowserTabProfileClone = (
  params: BrowserTabProfileCloneInput,
  { browserCommands }: RpcContext
) => browserCommands.browserTabProfileClone(params)

export const handleBrowserTabClose = (
  params: BrowserTabCloseInput,
  { browserCommands }: RpcContext
) => browserCommands.browserTabClose(params)

export const handleBrowserProfileList = (_params: void, { browserCommands }: RpcContext) =>
  browserCommands.browserProfileList()

export const handleBrowserProfileCreate = (
  params: BrowserProfileCreateInput,
  { browserCommands }: RpcContext
) => browserCommands.browserProfileCreate(params)

export const handleBrowserProfileDelete = (
  params: BrowserProfileDeleteInput,
  { browserCommands }: RpcContext
) => browserCommands.browserProfileDelete(params)

export const handleBrowserProfileDetectBrowsers = (
  _params: void,
  { browserCommands }: RpcContext
) => browserCommands.browserProfileDetectBrowsers()

export const handleBrowserProfileImportFromBrowser = (
  params: BrowserProfileImportInput,
  { browserCommands }: RpcContext
) => browserCommands.browserProfileImportFromBrowser(params)

export const handleBrowserProfileClearDefaultCookies = (
  _params: void,
  { browserCommands }: RpcContext
) => browserCommands.browserProfileClearDefaultCookies()
