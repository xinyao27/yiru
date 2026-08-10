import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'
import * as C from './control-input.js'
import type * as CR from './control-result.js'
import * as EI from './environment-input.js'
import type * as ER from './environment-result.js'
import type * as GE from './guest-event.js'
import * as PI from './page-input.js'
import type * as PR from './page-result.js'
import type * as SR from './screencast-result.js'
import * as SI from './session-input.js'
import type * as RR from './session-result.js'
import * as TI from './target-input.js'

const BROWSER_HOST_ACCESS = { scope: 'host', tier: 'host' } as const
const MOBILE_CLIENT = { mobile: true } as const
const SCREENCAST_CLIENT = { mobile: true, legacyMethod: 'browser.screencast' } as const

const hostProcedure = withAccess(BROWSER_HOST_ACCESS)
const mobileHostProcedure = withAccess(BROWSER_HOST_ACCESS, MOBILE_CLIENT)

export const browserContract = {
  pageControl: {
    register: hostProcedure
      .input(C.BrowserPageRegisterInputSchema)
      .output(type<CR.BrowserControlBooleanResult>()),
    unregister: hostProcedure
      .input(C.BrowserPageUnregisterInputSchema)
      .output(type<CR.BrowserControlBooleanResult>()),
    setActive: hostProcedure
      .input(C.BrowserPageIdInputSchema)
      .output(type<CR.BrowserControlBooleanResult>()),
    openDevTools: hostProcedure
      .input(C.BrowserPageIdInputSchema)
      .output(type<CR.BrowserControlBooleanResult>()),
    setViewportOverride: hostProcedure
      .input(C.BrowserViewportOverrideInputSchema)
      .output(type<CR.BrowserControlBooleanResult>()),
    setAnnotationViewport: hostProcedure
      .input(C.BrowserAnnotationViewportInputSchema)
      .output(type<CR.BrowserControlBooleanResult>())
  },
  downloadCancel: hostProcedure
    .input(C.BrowserDownloadCancelInputSchema)
    .output(type<CR.BrowserControlBooleanResult>()),
  grab: {
    setMode: hostProcedure
      .input(C.BrowserGrabSetModeInputSchema)
      .output(type<CR.BrowserGrabSetModeResult>()),
    awaitSelection: hostProcedure
      .input(C.BrowserGrabAwaitInputSchema)
      .output(type<CR.BrowserGrabResult>()),
    cancel: hostProcedure
      .input(C.BrowserPageIdInputSchema)
      .output(type<CR.BrowserControlBooleanResult>()),
    captureSelection: hostProcedure
      .input(C.BrowserGrabCaptureInputSchema)
      .output(type<CR.BrowserGrabCaptureResult>()),
    extractHover: hostProcedure
      .input(C.BrowserPageIdInputSchema)
      .output(type<CR.BrowserGrabExtractResult>())
  },
  snapshot: hostProcedure
    .input(TI.BrowserTargetInputSchema)
    .output(type<PR.BrowserSnapshotResult>()),
  click: hostProcedure.input(PI.BrowserElementInputSchema).output(type<PR.BrowserClickResult>()),
  goto: mobileHostProcedure.input(PI.BrowserGotoInputSchema).output(type<PR.BrowserGotoResult>()),
  certificate: {
    proceed: hostProcedure
      .input(PI.BrowserCertificateProceedInputSchema)
      .output(type<PR.BrowserCertificateProceedResult>())
  },
  fill: hostProcedure.input(PI.BrowserFillInputSchema).output(type<PR.BrowserFillResult>()),
  type: hostProcedure.input(PI.BrowserTypeInputSchema).output(type<PR.BrowserTypeResult>()),
  keyboardInsertText: mobileHostProcedure
    .input(PI.BrowserKeyboardInsertInputSchema)
    .output(type<PR.BrowserKeyboardInsertTextResult>()),
  select: hostProcedure.input(PI.BrowserSelectInputSchema).output(type<PR.BrowserSelectResult>()),
  scroll: hostProcedure.input(PI.BrowserScrollInputSchema).output(type<PR.BrowserScrollResult>()),
  back: mobileHostProcedure.input(TI.BrowserTargetInputSchema).output(type<PR.BrowserBackResult>()),
  reload: mobileHostProcedure
    .input(TI.BrowserTargetInputSchema)
    .output(type<PR.BrowserReloadResult>()),
  screenshot: hostProcedure
    .input(PI.BrowserScreenshotInputSchema)
    .output(type<PR.BrowserScreenshotResult>()),
  eval: hostProcedure.input(PI.BrowserEvalInputSchema).output(type<PR.BrowserEvalResult>()),
  hover: hostProcedure.input(PI.BrowserElementInputSchema).output(type<PR.BrowserHoverResult>()),
  drag: hostProcedure.input(PI.BrowserDragInputSchema).output(type<PR.BrowserDragResult>()),
  upload: hostProcedure.input(PI.BrowserUploadInputSchema).output(type<PR.BrowserUploadResult>()),
  wait: hostProcedure.input(PI.BrowserWaitInputSchema).output(type<PR.BrowserWaitResult>()),
  check: hostProcedure.input(PI.BrowserCheckInputSchema).output(type<PR.BrowserCheckResult>()),
  focus: hostProcedure.input(PI.BrowserElementInputSchema).output(type<PR.BrowserFocusResult>()),
  clear: hostProcedure.input(PI.BrowserElementInputSchema).output(type<PR.BrowserClearResult>()),
  selectAll: hostProcedure
    .input(PI.BrowserElementInputSchema)
    .output(type<PR.BrowserSelectAllResult>()),
  keypress: mobileHostProcedure
    .input(PI.BrowserKeypressInputSchema)
    .output(type<PR.BrowserKeypressResult>()),
  pdf: hostProcedure.input(TI.BrowserTargetInputSchema).output(type<PR.BrowserPdfResult>()),
  fullScreenshot: hostProcedure
    .input(PI.BrowserFullScreenshotInputSchema)
    .output(type<PR.BrowserScreenshotResult>()),
  dblclick: hostProcedure.input(PI.BrowserElementInputSchema).output(type<PR.BrowserClickResult>()),
  forward: mobileHostProcedure
    .input(TI.BrowserTargetInputSchema)
    .output(type<PR.BrowserForwardResult>()),
  scrollIntoView: hostProcedure
    .input(PI.BrowserElementInputSchema)
    .output(type<PR.BrowserScrollIntoViewResult>()),
  get: hostProcedure.input(PI.BrowserGetInputSchema).output(type<PR.BrowserGetResult>()),
  is: hostProcedure.input(PI.BrowserIsInputSchema).output(type<PR.BrowserIsResult>()),
  find: hostProcedure.input(PI.BrowserFindInputSchema).output(type<PR.BrowserFindResult>()),
  console: hostProcedure.input(PI.BrowserLimitInputSchema).output(type<PR.BrowserConsoleResult>()),
  network: hostProcedure
    .input(PI.BrowserLimitInputSchema)
    .output(type<PR.BrowserNetworkLogResult>()),
  exec: hostProcedure.input(PI.BrowserExecInputSchema).output(type<PR.BrowserExecResult>()),
  capture: {
    start: hostProcedure
      .input(TI.BrowserTargetInputSchema)
      .output(type<PR.BrowserCaptureStartResult>()),
    stop: hostProcedure
      .input(TI.BrowserTargetInputSchema)
      .output(type<PR.BrowserCaptureStopResult>())
  },
  download: hostProcedure
    .input(PI.BrowserSelectorPathInputSchema)
    .output(type<PR.BrowserDownloadResult>()),
  highlight: hostProcedure
    .input(PI.BrowserHighlightInputSchema)
    .output(type<PR.BrowserHighlightResult>()),
  tabList: hostProcedure
    .input(SI.BrowserTabListInputSchema)
    .output(type<RR.BrowserTabListResult>()),
  tabShow: hostProcedure
    .input(SI.BrowserTabShowInputSchema)
    .output(type<RR.BrowserTabShowResult>()),
  tabCurrent: hostProcedure
    .input(SI.BrowserTabCurrentInputSchema)
    .output(type<RR.BrowserTabCurrentResult>()),
  tabSwitch: hostProcedure
    .input(SI.BrowserTabSwitchInputSchema)
    .output(type<RR.BrowserTabSwitchResult>()),
  tabCreate: mobileHostProcedure
    .input(SI.BrowserTabCreateInputSchema)
    .output(type<RR.BrowserTabCreateResult>()),
  tabSetProfile: hostProcedure
    .input(SI.BrowserTabSetProfileInputSchema)
    .output(type<RR.BrowserTabSetProfileResult>()),
  tabProfileShow: hostProcedure
    .input(SI.BrowserTabShowInputSchema)
    .output(type<RR.BrowserTabProfileShowResult>()),
  tabProfileClone: hostProcedure
    .input(SI.BrowserTabProfileCloneInputSchema)
    .output(type<RR.BrowserTabProfileCloneResult>()),
  tabClose: hostProcedure
    .input(SI.BrowserTabCloseInputSchema)
    .output(type<RR.BrowserTabCloseResult>()),
  profileList: hostProcedure.input(type<void>()).output(type<RR.BrowserProfileListResult>()),
  profileCreate: hostProcedure
    .input(SI.BrowserProfileCreateInputSchema)
    .output(type<RR.BrowserProfileCreateResult>()),
  profileDelete: hostProcedure
    .input(SI.BrowserProfileDeleteInputSchema)
    .output(type<RR.BrowserProfileDeleteResult>()),
  profileDetectBrowsers: hostProcedure
    .input(type<void>())
    .output(type<RR.BrowserDetectProfilesResult>()),
  profileImportFromBrowser: hostProcedure
    .input(SI.BrowserProfileImportInputSchema)
    .output(type<RR.BrowserProfileImportFromBrowserResult>()),
  profileClearDefaultCookies: hostProcedure
    .input(type<void>())
    .output(type<RR.BrowserProfileClearDefaultCookiesResult>()),
  cookie: {
    get: hostProcedure
      .input(EI.BrowserCookieGetInputSchema)
      .output(type<ER.BrowserCookieGetResult>()),
    set: hostProcedure
      .input(EI.BrowserCookieSetInputSchema)
      .output(type<ER.BrowserCookieSetResult>()),
    delete: hostProcedure
      .input(EI.BrowserCookieDeleteInputSchema)
      .output(type<ER.BrowserCookieDeleteResult>())
  },
  viewport: mobileHostProcedure
    .input(EI.BrowserViewportInputSchema)
    .output(type<ER.BrowserViewportResult>()),
  geolocation: hostProcedure
    .input(EI.BrowserGeolocationInputSchema)
    .output(type<ER.BrowserGeolocationResult>()),
  intercept: {
    enable: hostProcedure
      .input(EI.BrowserInterceptEnableInputSchema)
      .output(type<ER.BrowserInterceptEnableResult>()),
    disable: hostProcedure
      .input(TI.BrowserTargetInputSchema)
      .output(type<ER.BrowserInterceptDisableResult>()),
    list: hostProcedure
      .input(TI.BrowserTargetInputSchema)
      .output(type<ER.BrowserInterceptListResult>())
  },
  mouseMove: mobileHostProcedure
    .input(EI.BrowserMouseCoordinatesInputSchema)
    .output(type<ER.BrowserMouseMoveResult>()),
  mouseDown: mobileHostProcedure
    .input(EI.BrowserMouseButtonInputSchema)
    .output(type<ER.BrowserMouseDownResult>()),
  mouseClick: mobileHostProcedure
    .input(EI.BrowserMouseClickInputSchema)
    .output(type<ER.BrowserMouseClickResult>()),
  mouseUp: mobileHostProcedure
    .input(EI.BrowserMouseButtonInputSchema)
    .output(type<ER.BrowserMouseUpResult>()),
  mouseWheel: mobileHostProcedure
    .input(EI.BrowserMouseWheelInputSchema)
    .output(type<ER.BrowserMouseWheelResult>()),
  setDevice: hostProcedure
    .input(EI.BrowserSetDeviceInputSchema)
    .output(type<ER.BrowserSetDeviceResult>()),
  setOffline: hostProcedure
    .input(EI.BrowserSetOfflineInputSchema)
    .output(type<ER.BrowserSetOfflineResult>()),
  setHeaders: hostProcedure
    .input(EI.BrowserSetHeadersInputSchema)
    .output(type<ER.BrowserSetHeadersResult>()),
  setCredentials: hostProcedure
    .input(EI.BrowserSetCredentialsInputSchema)
    .output(type<ER.BrowserSetCredentialsResult>()),
  setMedia: hostProcedure
    .input(EI.BrowserSetMediaInputSchema)
    .output(type<ER.BrowserSetMediaResult>()),
  clipboardRead: hostProcedure
    .input(TI.BrowserTargetInputSchema)
    .output(type<ER.BrowserClipboardReadResult>()),
  clipboardWrite: hostProcedure
    .input(EI.BrowserClipboardWriteInputSchema)
    .output(type<ER.BrowserClipboardWriteResult>()),
  dialogAccept: mobileHostProcedure
    .input(EI.BrowserDialogAcceptInputSchema)
    .output(type<ER.BrowserDialogAcceptResult>()),
  dialogDismiss: mobileHostProcedure
    .input(TI.BrowserTargetInputSchema)
    .output(type<ER.BrowserDialogDismissResult>()),
  storage: {
    local: {
      get: hostProcedure
        .input(EI.BrowserStorageKeyInputSchema)
        .output(type<ER.BrowserStorageGetResult>()),
      set: hostProcedure
        .input(EI.BrowserStorageKeyValueInputSchema)
        .output(type<ER.BrowserStorageSetResult>()),
      clear: hostProcedure
        .input(TI.BrowserTargetInputSchema)
        .output(type<ER.BrowserStorageClearResult>())
    },
    session: {
      get: hostProcedure
        .input(EI.BrowserStorageKeyInputSchema)
        .output(type<ER.BrowserStorageGetResult>()),
      set: hostProcedure
        .input(EI.BrowserStorageKeyValueInputSchema)
        .output(type<ER.BrowserStorageSetResult>()),
      clear: hostProcedure
        .input(TI.BrowserTargetInputSchema)
        .output(type<ER.BrowserStorageClearResult>())
    }
  },
  // Why: one host-wide stream rather than nine procedures — clients want the
  // whole guest-event feed, and a single subscription keeps server-side
  // subscription state proportional to clients, not to event kinds.
  guestEvents: {
    subscribe: withAccess(BROWSER_HOST_ACCESS, MOBILE_CLIENT)
      .input(type<void>())
      .output(eventIterator(type<GE.RuntimeBrowserGuestSubscriptionEvent>()))
  },
  screencast: {
    subscribe: withAccess(BROWSER_HOST_ACCESS, SCREENCAST_CLIENT)
      .input(PI.BrowserScreencastInputSchema)
      .output(eventIterator(type<SR.BrowserScreencastResult>())),
    unsubscribe: mobileHostProcedure
      .input(PI.BrowserScreencastUnsubscribeInputSchema)
      .output(type<PR.BrowserScreencastUnsubscribeResult>())
  }
} satisfies ContractRouter<RuntimeProcedureMeta>

export * from './environment-input.js'
export * from './control-input.js'
export type * from './control-result.js'
export type * from './guest-event.js'
export * from './environment-result.js'
export * from './page-input.js'
export * from './page-result.js'
export * from './screencast-result.js'
export * from './session-input.js'
export * from './session-result.js'
export { BrowserTargetInputSchema } from './target-input.js'
export type { BrowserTargetInput } from './target-input.js'
