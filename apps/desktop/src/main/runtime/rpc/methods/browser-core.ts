import {
  BrowserTarget,
  requiredString
} from '~shared/runtime-method-contracts/runtime-method-params'

import { defineMethod, type RpcMethod } from '../core'
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
  Screenshot,
  Scroll,
  Select,
  SelectorPath,
  Upload,
  Wait
} from './browser-schemas'
import { BROWSER_TAB_PROFILE_METHODS } from './browser-tab-profiles'
import { BROWSER_TEXT_METHODS } from './browser-text-rpc-methods'

const CertificateProceed = BrowserTarget.extend({
  challengeId: requiredString('Missing required challengeId')
})

export const BROWSER_CORE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'browser.snapshot',
    params: BrowserTarget,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserSnapshot(params)
  }),
  defineMethod({
    name: 'browser.click',
    params: Element,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserClick(params)
  }),
  defineMethod({
    name: 'browser.goto',
    mobile: true,
    params: Goto,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserGoto(params)
  }),
  defineMethod({
    name: 'browser.certificate.proceed',
    params: CertificateProceed,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) =>
      browserCommands.browserProceedCertificate(params)
  }),
  ...BROWSER_TEXT_METHODS,
  defineMethod({
    name: 'browser.select',
    params: Select,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserSelect(params)
  }),
  defineMethod({
    name: 'browser.scroll',
    params: Scroll,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserScroll(params)
  }),
  defineMethod({
    name: 'browser.back',
    mobile: true,
    params: BrowserTarget,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserBack(params)
  }),
  defineMethod({
    name: 'browser.reload',
    mobile: true,
    params: BrowserTarget,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserReload(params)
  }),
  defineMethod({
    name: 'browser.screenshot',
    params: Screenshot,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserScreenshot(params)
  }),
  defineMethod({
    name: 'browser.eval',
    params: Eval,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserEval(params)
  }),
  defineMethod({
    name: 'browser.hover',
    params: Element,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserHover(params)
  }),
  defineMethod({
    name: 'browser.drag',
    params: Drag,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserDrag(params)
  }),
  defineMethod({
    name: 'browser.upload',
    params: Upload,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserUpload(params)
  }),
  defineMethod({
    name: 'browser.wait',
    params: Wait,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserWait(params)
  }),
  defineMethod({
    name: 'browser.check',
    params: Check,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserCheck(params)
  }),
  defineMethod({
    name: 'browser.focus',
    params: Element,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserFocus(params)
  }),
  defineMethod({
    name: 'browser.clear',
    params: Element,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserClear(params)
  }),
  defineMethod({
    name: 'browser.selectAll',
    params: Element,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserSelectAll(params)
  }),
  defineMethod({
    name: 'browser.keypress',
    mobile: true,
    params: Keypress,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserKeypress(params)
  }),
  defineMethod({
    name: 'browser.pdf',
    params: BrowserTarget,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserPdf(params)
  }),
  defineMethod({
    name: 'browser.fullScreenshot',
    params: FullScreenshot,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserFullScreenshot(params)
  }),
  defineMethod({
    name: 'browser.dblclick',
    params: Element,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserDblclick(params)
  }),
  defineMethod({
    name: 'browser.forward',
    mobile: true,
    params: BrowserTarget,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserForward(params)
  }),
  defineMethod({
    name: 'browser.scrollIntoView',
    params: Element,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserScrollIntoView(params)
  }),
  defineMethod({
    name: 'browser.get',
    params: Get,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserGet(params)
  }),
  defineMethod({
    name: 'browser.is',
    params: Is,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserIs(params)
  }),
  defineMethod({
    name: 'browser.find',
    params: Find,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserFind(params)
  }),
  defineMethod({
    name: 'browser.console',
    params: LimitParam,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserConsoleLog(params)
  }),
  defineMethod({
    name: 'browser.network',
    params: LimitParam,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserNetworkLog(params)
  }),
  defineMethod({
    name: 'browser.exec',
    params: Exec,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserExec(params)
  }),
  defineMethod({
    name: 'browser.capture.start',
    params: BrowserTarget,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserCaptureStart(params)
  }),
  defineMethod({
    name: 'browser.capture.stop',
    params: BrowserTarget,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserCaptureStop(params)
  }),
  defineMethod({
    name: 'browser.download',
    params: SelectorPath,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserDownload(params)
  }),
  defineMethod({
    name: 'browser.highlight',
    params: Highlight,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserHighlight(params)
  }),
  ...BROWSER_TAB_PROFILE_METHODS
]
