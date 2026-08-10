import {
  handleBrowserProfileClearDefaultCookies,
  handleBrowserProfileCreate,
  handleBrowserProfileDelete,
  handleBrowserProfileDetectBrowsers,
  handleBrowserProfileImportFromBrowser,
  handleBrowserProfileList
} from '~main/runtime/rpc/methods/browser-tab-profiles'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: browser profile management — split out of browser.ts, direct-wired only, no
// mobile bare-channel caller for any of these.
export function browserProfileLeaves() {
  return {
    profileList: runtimeImplementation.browser.profileList.handler(
      wireRuntimeMethod('browser.profileList', handleBrowserProfileList)
    ),
    profileCreate: runtimeImplementation.browser.profileCreate.handler(
      wireRuntimeMethod('browser.profileCreate', handleBrowserProfileCreate)
    ),
    profileDelete: runtimeImplementation.browser.profileDelete.handler(
      wireRuntimeMethod('browser.profileDelete', handleBrowserProfileDelete)
    ),
    profileDetectBrowsers: runtimeImplementation.browser.profileDetectBrowsers.handler(
      wireRuntimeMethod('browser.profileDetectBrowsers', handleBrowserProfileDetectBrowsers)
    ),
    profileImportFromBrowser: runtimeImplementation.browser.profileImportFromBrowser.handler(
      wireRuntimeMethod('browser.profileImportFromBrowser', handleBrowserProfileImportFromBrowser)
    ),
    profileClearDefaultCookies: runtimeImplementation.browser.profileClearDefaultCookies.handler(
      wireRuntimeMethod(
        'browser.profileClearDefaultCookies',
        handleBrowserProfileClearDefaultCookies
      )
    )
  } as const
}
