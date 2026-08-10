import {
  handleBrowserBack,
  handleBrowserCertificateProceed,
  handleBrowserForward,
  handleBrowserGoto,
  handleBrowserReload
} from '~main/runtime/rpc/methods/browser-core'
import {
  handleBrowserTabClose,
  handleBrowserTabCreate,
  handleBrowserTabCurrent,
  handleBrowserTabList,
  handleBrowserTabProfileClone,
  handleBrowserTabProfileShow,
  handleBrowserTabSetProfile,
  handleBrowserTabShow,
  handleBrowserTabSwitch
} from '~main/runtime/rpc/methods/browser-tab-profiles'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: page navigation plus the tab/profile identity surface that goes with it — split
// out of browser.ts (orpc/router-direct/browser.ts) because 95 leaves across one
// top-level `browser` contract key would blow the 300-line cap folded into one file.
// `goto`/`back`/`forward`/`reload` used to keep a legacy twin in methods/browser-core.ts
// for mobile's bare-string channel; 切片 83 moved that caller onto `callRuntimeOrpc`, so
// this whole file is direct-wired only, same as tabs/profiles.
export function browserNavigationLeaves() {
  return {
    goto: runtimeImplementation.browser.goto.handler(
      wireRuntimeMethod('browser.goto', handleBrowserGoto)
    ),
    back: runtimeImplementation.browser.back.handler(
      wireRuntimeMethod('browser.back', handleBrowserBack)
    ),
    forward: runtimeImplementation.browser.forward.handler(
      wireRuntimeMethod('browser.forward', handleBrowserForward)
    ),
    reload: runtimeImplementation.browser.reload.handler(
      wireRuntimeMethod('browser.reload', handleBrowserReload)
    ),
    certificate: {
      proceed: runtimeImplementation.browser.certificate.proceed.handler(
        wireRuntimeMethod('browser.certificate.proceed', handleBrowserCertificateProceed)
      )
    },
    tabList: runtimeImplementation.browser.tabList.handler(
      wireRuntimeMethod('browser.tabList', handleBrowserTabList)
    ),
    tabShow: runtimeImplementation.browser.tabShow.handler(
      wireRuntimeMethod('browser.tabShow', handleBrowserTabShow)
    ),
    tabCurrent: runtimeImplementation.browser.tabCurrent.handler(
      wireRuntimeMethod('browser.tabCurrent', handleBrowserTabCurrent)
    ),
    tabSwitch: runtimeImplementation.browser.tabSwitch.handler(
      wireRuntimeMethod('browser.tabSwitch', handleBrowserTabSwitch)
    ),
    tabCreate: runtimeImplementation.browser.tabCreate.handler(
      wireRuntimeMethod('browser.tabCreate', handleBrowserTabCreate)
    ),
    tabSetProfile: runtimeImplementation.browser.tabSetProfile.handler(
      wireRuntimeMethod('browser.tabSetProfile', handleBrowserTabSetProfile)
    ),
    tabProfileShow: runtimeImplementation.browser.tabProfileShow.handler(
      wireRuntimeMethod('browser.tabProfileShow', handleBrowserTabProfileShow)
    ),
    tabProfileClone: runtimeImplementation.browser.tabProfileClone.handler(
      wireRuntimeMethod('browser.tabProfileClone', handleBrowserTabProfileClone)
    ),
    tabClose: runtimeImplementation.browser.tabClose.handler(
      wireRuntimeMethod('browser.tabClose', handleBrowserTabClose)
    )
  } as const
}
