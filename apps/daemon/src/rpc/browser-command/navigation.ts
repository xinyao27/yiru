import { daemonImplementation } from '../contract'
import type { BrowserCommandDelegate } from './router'

export function createNavigationHandlers(delegate: BrowserCommandDelegate) {
  return {
    back: daemonImplementation.browser.back.handler(({ input }) => delegate('browser.back', input)),
    certificate: {
      proceed: daemonImplementation.browser.certificate.proceed.handler(({ input }) =>
        delegate('browser.certificate.proceed', input)
      )
    },
    forward: daemonImplementation.browser.forward.handler(({ input }) =>
      delegate('browser.forward', input)
    ),
    goto: daemonImplementation.browser.goto.handler(({ input }) => delegate('browser.goto', input)),
    profileClearDefaultCookies: daemonImplementation.browser.profileClearDefaultCookies.handler(
      ({ input }) => delegate('browser.profileClearDefaultCookies', input)
    ),
    profileCreate: daemonImplementation.browser.profileCreate.handler(({ input }) =>
      delegate('browser.profileCreate', input)
    ),
    profileDelete: daemonImplementation.browser.profileDelete.handler(({ input }) =>
      delegate('browser.profileDelete', input)
    ),
    profileDetectBrowsers: daemonImplementation.browser.profileDetectBrowsers.handler(({ input }) =>
      delegate('browser.profileDetectBrowsers', input)
    ),
    profileImportFromBrowser: daemonImplementation.browser.profileImportFromBrowser.handler(
      ({ input }) => delegate('browser.profileImportFromBrowser', input)
    ),
    profileList: daemonImplementation.browser.profileList.handler(({ input }) =>
      delegate('browser.profileList', input)
    ),
    reload: daemonImplementation.browser.reload.handler(({ input }) =>
      delegate('browser.reload', input)
    ),
    tabClose: daemonImplementation.browser.tabClose.handler(({ input }) =>
      delegate('browser.tabClose', input)
    ),
    tabCreate: daemonImplementation.browser.tabCreate.handler(({ input }) =>
      delegate('browser.tabCreate', input)
    ),
    tabCurrent: daemonImplementation.browser.tabCurrent.handler(({ input }) =>
      delegate('browser.tabCurrent', input)
    ),
    tabList: daemonImplementation.browser.tabList.handler(({ input }) =>
      delegate('browser.tabList', input)
    ),
    tabProfileClone: daemonImplementation.browser.tabProfileClone.handler(({ input }) =>
      delegate('browser.tabProfileClone', input)
    ),
    tabProfileShow: daemonImplementation.browser.tabProfileShow.handler(({ input }) =>
      delegate('browser.tabProfileShow', input)
    ),
    tabSetProfile: daemonImplementation.browser.tabSetProfile.handler(({ input }) =>
      delegate('browser.tabSetProfile', input)
    ),
    tabShow: daemonImplementation.browser.tabShow.handler(({ input }) =>
      delegate('browser.tabShow', input)
    ),
    tabSwitch: daemonImplementation.browser.tabSwitch.handler(({ input }) =>
      delegate('browser.tabSwitch', input)
    )
  }
}
