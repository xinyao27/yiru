import { defineMethod, type RpcMethod } from '../core'
import { BrowserTarget, requiredString } from '../schemas'
import {
  Check,
  Drag,
  Element,
  Eval,
  Exec,
  Find,
  FullScreenshot,
  Get,
  Goto,
  Highlight,
  Is,
  Keypress,
  LimitParam,
  ProfileCreate,
  ProfileDelete,
  ProfileImportFromBrowser,
  Screenshot,
  Scroll,
  Select,
  SelectorPath,
  TabCurrent,
  TabSetProfile,
  TabClose,
  TabCreate,
  TabList,
  TabProfileClone,
  TabShow,
  TabSwitch,
  Upload,
  Wait
} from './browser-schemas'
import { BROWSER_TEXT_METHODS } from './browser-text-rpc-methods'

const CertificateProceed = BrowserTarget.extend({
  challengeId: requiredString('Missing required challengeId')
})

export const BROWSER_CORE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'browser.snapshot',
    params: BrowserTarget,
    handler: async (params, { browserCommands }) => browserCommands.browserSnapshot(params)
  }),
  defineMethod({
    name: 'browser.click',
    params: Element,
    handler: async (params, { browserCommands }) => browserCommands.browserClick(params)
  }),
  defineMethod({
    name: 'browser.goto',
    params: Goto,
    handler: async (params, { browserCommands }) => browserCommands.browserGoto(params)
  }),
  defineMethod({
    name: 'browser.certificate.proceed',
    params: CertificateProceed,
    handler: async (params, { browserCommands }) =>
      browserCommands.browserProceedCertificate(params)
  }),
  ...BROWSER_TEXT_METHODS,
  defineMethod({
    name: 'browser.select',
    params: Select,
    handler: async (params, { browserCommands }) => browserCommands.browserSelect(params)
  }),
  defineMethod({
    name: 'browser.scroll',
    params: Scroll,
    handler: async (params, { browserCommands }) => browserCommands.browserScroll(params)
  }),
  defineMethod({
    name: 'browser.back',
    params: BrowserTarget,
    handler: async (params, { browserCommands }) => browserCommands.browserBack(params)
  }),
  defineMethod({
    name: 'browser.reload',
    params: BrowserTarget,
    handler: async (params, { browserCommands }) => browserCommands.browserReload(params)
  }),
  defineMethod({
    name: 'browser.screenshot',
    params: Screenshot,
    handler: async (params, { browserCommands }) => browserCommands.browserScreenshot(params)
  }),
  defineMethod({
    name: 'browser.eval',
    params: Eval,
    handler: async (params, { browserCommands }) => browserCommands.browserEval(params)
  }),
  defineMethod({
    name: 'browser.tabList',
    params: TabList,
    handler: async (params, { browserCommands }) => browserCommands.browserTabList(params)
  }),
  defineMethod({
    name: 'browser.tabShow',
    params: TabShow,
    handler: async (params, { browserCommands }) => browserCommands.browserTabShow(params)
  }),
  defineMethod({
    name: 'browser.tabCurrent',
    params: TabCurrent,
    handler: async (params, { browserCommands }) => browserCommands.browserTabCurrent(params)
  }),
  defineMethod({
    name: 'browser.tabSwitch',
    params: TabSwitch,
    handler: async (params, { browserCommands }) => browserCommands.browserTabSwitch(params)
  }),
  defineMethod({
    name: 'browser.tabCreate',
    params: TabCreate,
    handler: async (params, { browserCommands }) => browserCommands.browserTabCreate(params)
  }),
  defineMethod({
    name: 'browser.tabSetProfile',
    params: TabSetProfile,
    handler: async (params, { browserCommands }) => browserCommands.browserTabSetProfile(params)
  }),
  defineMethod({
    name: 'browser.tabProfileShow',
    params: TabShow,
    handler: async (params, { browserCommands }) => browserCommands.browserTabProfileShow(params)
  }),
  defineMethod({
    name: 'browser.tabProfileClone',
    params: TabProfileClone,
    handler: async (params, { browserCommands }) => browserCommands.browserTabProfileClone(params)
  }),
  defineMethod({
    name: 'browser.tabClose',
    params: TabClose,
    handler: async (params, { browserCommands }) => browserCommands.browserTabClose(params)
  }),
  defineMethod({
    name: 'browser.profileList',
    params: null,
    handler: async (_params, { browserCommands }) => browserCommands.browserProfileList()
  }),
  defineMethod({
    name: 'browser.profileCreate',
    params: ProfileCreate,
    handler: async (params, { browserCommands }) => browserCommands.browserProfileCreate(params)
  }),
  defineMethod({
    name: 'browser.profileDelete',
    params: ProfileDelete,
    handler: async (params, { browserCommands }) => browserCommands.browserProfileDelete(params)
  }),
  defineMethod({
    name: 'browser.profileDetectBrowsers',
    params: null,
    handler: async (_params, { browserCommands }) => browserCommands.browserProfileDetectBrowsers()
  }),
  defineMethod({
    name: 'browser.profileImportFromBrowser',
    params: ProfileImportFromBrowser,
    handler: async (params, { browserCommands }) =>
      browserCommands.browserProfileImportFromBrowser(params)
  }),
  defineMethod({
    name: 'browser.profileClearDefaultCookies',
    params: null,
    handler: async (_params, { browserCommands }) =>
      browserCommands.browserProfileClearDefaultCookies()
  }),
  defineMethod({
    name: 'browser.hover',
    params: Element,
    handler: async (params, { browserCommands }) => browserCommands.browserHover(params)
  }),
  defineMethod({
    name: 'browser.drag',
    params: Drag,
    handler: async (params, { browserCommands }) => browserCommands.browserDrag(params)
  }),
  defineMethod({
    name: 'browser.upload',
    params: Upload,
    handler: async (params, { browserCommands }) => browserCommands.browserUpload(params)
  }),
  defineMethod({
    name: 'browser.wait',
    params: Wait,
    handler: async (params, { browserCommands }) => browserCommands.browserWait(params)
  }),
  defineMethod({
    name: 'browser.check',
    params: Check,
    handler: async (params, { browserCommands }) => browserCommands.browserCheck(params)
  }),
  defineMethod({
    name: 'browser.focus',
    params: Element,
    handler: async (params, { browserCommands }) => browserCommands.browserFocus(params)
  }),
  defineMethod({
    name: 'browser.clear',
    params: Element,
    handler: async (params, { browserCommands }) => browserCommands.browserClear(params)
  }),
  defineMethod({
    name: 'browser.selectAll',
    params: Element,
    handler: async (params, { browserCommands }) => browserCommands.browserSelectAll(params)
  }),
  defineMethod({
    name: 'browser.keypress',
    params: Keypress,
    handler: async (params, { browserCommands }) => browserCommands.browserKeypress(params)
  }),
  defineMethod({
    name: 'browser.pdf',
    params: BrowserTarget,
    handler: async (params, { browserCommands }) => browserCommands.browserPdf(params)
  }),
  defineMethod({
    name: 'browser.fullScreenshot',
    params: FullScreenshot,
    handler: async (params, { browserCommands }) => browserCommands.browserFullScreenshot(params)
  }),
  defineMethod({
    name: 'browser.dblclick',
    params: Element,
    handler: async (params, { browserCommands }) => browserCommands.browserDblclick(params)
  }),
  defineMethod({
    name: 'browser.forward',
    params: BrowserTarget,
    handler: async (params, { browserCommands }) => browserCommands.browserForward(params)
  }),
  defineMethod({
    name: 'browser.scrollIntoView',
    params: Element,
    handler: async (params, { browserCommands }) => browserCommands.browserScrollIntoView(params)
  }),
  defineMethod({
    name: 'browser.get',
    params: Get,
    handler: async (params, { browserCommands }) => browserCommands.browserGet(params)
  }),
  defineMethod({
    name: 'browser.is',
    params: Is,
    handler: async (params, { browserCommands }) => browserCommands.browserIs(params)
  }),
  defineMethod({
    name: 'browser.find',
    params: Find,
    handler: async (params, { browserCommands }) => browserCommands.browserFind(params)
  }),
  defineMethod({
    name: 'browser.console',
    params: LimitParam,
    handler: async (params, { browserCommands }) => browserCommands.browserConsoleLog(params)
  }),
  defineMethod({
    name: 'browser.network',
    params: LimitParam,
    handler: async (params, { browserCommands }) => browserCommands.browserNetworkLog(params)
  }),
  defineMethod({
    name: 'browser.exec',
    params: Exec,
    handler: async (params, { browserCommands }) => browserCommands.browserExec(params)
  }),
  defineMethod({
    name: 'browser.capture.start',
    params: BrowserTarget,
    handler: async (params, { browserCommands }) => browserCommands.browserCaptureStart(params)
  }),
  defineMethod({
    name: 'browser.capture.stop',
    params: BrowserTarget,
    handler: async (params, { browserCommands }) => browserCommands.browserCaptureStop(params)
  }),
  defineMethod({
    name: 'browser.download',
    params: SelectorPath,
    handler: async (params, { browserCommands }) => browserCommands.browserDownload(params)
  }),
  defineMethod({
    name: 'browser.highlight',
    params: Highlight,
    handler: async (params, { browserCommands }) => browserCommands.browserHighlight(params)
  })
]
