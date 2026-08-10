import type {
  BrowserCertificateProceedInput,
  BrowserCheckInput,
  BrowserDragInput,
  BrowserElementInput,
  BrowserEvalInput,
  BrowserExecInput,
  BrowserFindInput,
  BrowserFullScreenshotInput,
  BrowserGetInput,
  BrowserGotoInput,
  BrowserHighlightInput,
  BrowserIsInput,
  BrowserKeypressInput,
  BrowserLimitInput,
  BrowserScreenshotInput,
  BrowserScrollInput,
  BrowserSelectInput,
  BrowserSelectorPathInput,
  BrowserTargetInput,
  BrowserUploadInput,
  BrowserWaitInput
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

export const handleBrowserSnapshot = (
  params: BrowserTargetInput,
  { browserCommands }: RpcContext
) => browserCommands.browserSnapshot(params)

export const handleBrowserClick = (params: BrowserElementInput, { browserCommands }: RpcContext) =>
  browserCommands.browserClick(params)

export const handleBrowserGoto = (params: BrowserGotoInput, { browserCommands }: RpcContext) =>
  browserCommands.browserGoto(params)

export const handleBrowserCertificateProceed = (
  params: BrowserCertificateProceedInput,
  { browserCommands }: RpcContext
) => browserCommands.browserProceedCertificate(params)

export const handleBrowserSelect = (params: BrowserSelectInput, { browserCommands }: RpcContext) =>
  browserCommands.browserSelect(params)

export const handleBrowserScroll = (params: BrowserScrollInput, { browserCommands }: RpcContext) =>
  browserCommands.browserScroll(params)

export const handleBrowserBack = (params: BrowserTargetInput, { browserCommands }: RpcContext) =>
  browserCommands.browserBack(params)

export const handleBrowserReload = (params: BrowserTargetInput, { browserCommands }: RpcContext) =>
  browserCommands.browserReload(params)

export const handleBrowserScreenshot = (
  params: BrowserScreenshotInput,
  { browserCommands }: RpcContext
) => browserCommands.browserScreenshot(params)

export const handleBrowserEval = (params: BrowserEvalInput, { browserCommands }: RpcContext) =>
  browserCommands.browserEval(params)

export const handleBrowserHover = (params: BrowserElementInput, { browserCommands }: RpcContext) =>
  browserCommands.browserHover(params)

export const handleBrowserDrag = (params: BrowserDragInput, { browserCommands }: RpcContext) =>
  browserCommands.browserDrag(params)

export const handleBrowserUpload = (params: BrowserUploadInput, { browserCommands }: RpcContext) =>
  browserCommands.browserUpload(params)

export const handleBrowserWait = (params: BrowserWaitInput, { browserCommands }: RpcContext) =>
  browserCommands.browserWait(params)

export const handleBrowserCheck = (params: BrowserCheckInput, { browserCommands }: RpcContext) =>
  browserCommands.browserCheck(params)

export const handleBrowserFocus = (params: BrowserElementInput, { browserCommands }: RpcContext) =>
  browserCommands.browserFocus(params)

export const handleBrowserClear = (params: BrowserElementInput, { browserCommands }: RpcContext) =>
  browserCommands.browserClear(params)

export const handleBrowserSelectAll = (
  params: BrowserElementInput,
  { browserCommands }: RpcContext
) => browserCommands.browserSelectAll(params)

export const handleBrowserKeypress = (
  params: BrowserKeypressInput,
  { browserCommands }: RpcContext
) => browserCommands.browserKeypress(params)

export const handleBrowserPdf = (params: BrowserTargetInput, { browserCommands }: RpcContext) =>
  browserCommands.browserPdf(params)

export const handleBrowserFullScreenshot = (
  params: BrowserFullScreenshotInput,
  { browserCommands }: RpcContext
) => browserCommands.browserFullScreenshot(params)

export const handleBrowserDblclick = (
  params: BrowserElementInput,
  { browserCommands }: RpcContext
) => browserCommands.browserDblclick(params)

export const handleBrowserForward = (params: BrowserTargetInput, { browserCommands }: RpcContext) =>
  browserCommands.browserForward(params)

export const handleBrowserScrollIntoView = (
  params: BrowserElementInput,
  { browserCommands }: RpcContext
) => browserCommands.browserScrollIntoView(params)

export const handleBrowserGet = (params: BrowserGetInput, { browserCommands }: RpcContext) =>
  browserCommands.browserGet(params)

export const handleBrowserIs = (params: BrowserIsInput, { browserCommands }: RpcContext) =>
  browserCommands.browserIs(params)

export const handleBrowserFind = (params: BrowserFindInput, { browserCommands }: RpcContext) =>
  browserCommands.browserFind(params)

export const handleBrowserConsole = (params: BrowserLimitInput, { browserCommands }: RpcContext) =>
  browserCommands.browserConsoleLog(params)

export const handleBrowserNetwork = (params: BrowserLimitInput, { browserCommands }: RpcContext) =>
  browserCommands.browserNetworkLog(params)

export const handleBrowserExec = (params: BrowserExecInput, { browserCommands }: RpcContext) =>
  browserCommands.browserExec(params)

export const handleBrowserCaptureStart = (
  params: BrowserTargetInput,
  { browserCommands }: RpcContext
) => browserCommands.browserCaptureStart(params)

export const handleBrowserCaptureStop = (
  params: BrowserTargetInput,
  { browserCommands }: RpcContext
) => browserCommands.browserCaptureStop(params)

export const handleBrowserDownload = (
  params: BrowserSelectorPathInput,
  { browserCommands }: RpcContext
) => browserCommands.browserDownload(params)

export const handleBrowserHighlight = (
  params: BrowserHighlightInput,
  { browserCommands }: RpcContext
) => browserCommands.browserHighlight(params)
