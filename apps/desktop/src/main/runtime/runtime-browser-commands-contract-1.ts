import type {
  BrowserAnnotationViewportInput,
  BrowserControlBooleanResult,
  BrowserDownloadCancelInput,
  BrowserGrabAwaitInput,
  BrowserGrabCaptureInput,
  BrowserGrabCaptureResult,
  BrowserGrabExtractResult,
  BrowserGrabResult,
  BrowserGrabSetModeInput,
  BrowserGrabSetModeResult,
  BrowserPageIdInput,
  BrowserPageRegisterInput,
  BrowserPageUnregisterInput,
  BrowserViewportOverrideInput
} from '@yiru/runtime-protocol/contract'
import type {
  BrowserBackResult,
  BrowserCheckResult,
  BrowserClearResult,
  BrowserClickResult,
  BrowserCookieDeleteResult,
  BrowserCookieGetResult,
  BrowserCookieSetResult,
  BrowserDragResult,
  BrowserEvalResult,
  BrowserFillResult,
  BrowserFocusResult,
  BrowserGeolocationResult,
  BrowserGotoResult,
  BrowserHoverResult,
  BrowserInterceptEnableResult,
  BrowserKeypressResult,
  BrowserPdfResult,
  BrowserReloadResult,
  BrowserScreenshotResult,
  BrowserScreencastResult,
  BrowserScrollResult,
  BrowserSelectAllResult,
  BrowserSelectResult,
  BrowserSnapshotResult,
  RuntimeBrowserDriverState,
  BrowserTabCurrentResult,
  BrowserTabListResult,
  BrowserTabShowResult,
  BrowserTabSwitchResult,
  BrowserTypeResult,
  BrowserUploadResult,
  BrowserViewportResult,
  BrowserWaitResult
} from '~shared/runtime-types'
import type { BrowserCertificateProceedResult } from '~shared/types'

import type { AgentBrowserBridge } from '../browser/agent-browser-bridge'
import { RuntimeBrowserCommandsBase } from './runtime-browser-commands-base'
import type {
  ResolvedBrowserCommandTarget,
  ResolvedBrowserPage,
  BrowserScreencastParams
} from './runtime-browser-foundation'

export abstract class RuntimeBrowserCommandsContract1 extends RuntimeBrowserCommandsBase {
  abstract getDrivers(): Map<string, RuntimeBrowserDriverState>
  abstract browserPageRegister(
    input: BrowserPageRegisterInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserControlBooleanResult>
  abstract browserPageUnregister(
    input: BrowserPageUnregisterInput,
    shellConnectionId: string | undefined
  ): BrowserControlBooleanResult
  abstract browserPageSetActive(
    input: BrowserPageIdInput,
    shellConnectionId: string | undefined
  ): BrowserControlBooleanResult
  abstract browserOpenDevTools(
    input: BrowserPageIdInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserControlBooleanResult>
  abstract browserSetViewportOverride(
    input: BrowserViewportOverrideInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserControlBooleanResult>
  abstract browserSetAnnotationViewport(
    input: BrowserAnnotationViewportInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserControlBooleanResult>
  abstract browserCancelDownload(
    input: BrowserDownloadCancelInput,
    shellConnectionId: string | undefined
  ): BrowserControlBooleanResult
  abstract browserSetGrabMode(
    input: BrowserGrabSetModeInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserGrabSetModeResult>
  abstract browserAwaitGrabSelection(
    input: BrowserGrabAwaitInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserGrabResult>
  abstract browserCancelGrab(
    input: BrowserPageIdInput,
    shellConnectionId: string | undefined
  ): BrowserControlBooleanResult
  abstract browserCaptureSelection(
    input: BrowserGrabCaptureInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserGrabCaptureResult>
  abstract browserExtractHover(
    input: BrowserPageIdInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserGrabExtractResult>
  abstract reclaimForDesktop(browserPageId: string): boolean
  protected abstract requireAgentBrowserBridge(): AgentBrowserBridge
  protected abstract hasLiveRegisteredBrowserTab(
    bridge: AgentBrowserBridge,
    worktreeId: string | undefined
  ): boolean
  protected abstract hasLiveRegisteredBrowserPage(
    bridge: AgentBrowserBridge,
    worktreeId: string | undefined,
    browserPageId: string
  ): boolean
  protected abstract resolveBrowserWorktreeId(selector?: string): Promise<string | undefined>
  protected abstract resolveBrowserCommandTarget(
    params: BrowserCommandTargetParams
  ): Promise<ResolvedBrowserCommandTarget>
  protected abstract resolveBrowserPage(
    worktreeId: string | undefined,
    browserPageId: string | undefined
  ): ResolvedBrowserPage
  protected abstract ensureBrowserWorktreeActive(worktreeId: string | undefined): Promise<void>
  protected abstract ensureBrowserPageActive(
    worktreeId: string | undefined,
    browserPageId: string
  ): Promise<void>
  protected abstract notifyRendererNavigation(
    browserPageId: string,
    url: string,
    title: string
  ): void
  protected abstract notifyRendererBrowserPaneFocus(
    worktreeId: string | undefined,
    browserPageId: string
  ): void
  abstract browserSnapshot(params: BrowserCommandTargetParams): Promise<BrowserSnapshotResult>
  abstract browserClick(
    params: { element: string } & BrowserCommandTargetParams
  ): Promise<BrowserClickResult>
  abstract browserGoto(
    params: { url: string } & BrowserCommandTargetParams
  ): Promise<BrowserGotoResult>
  abstract browserFill(
    params: {
      element: string
      value: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserFillResult>
  abstract browserType(
    params: { input: string } & BrowserCommandTargetParams
  ): Promise<BrowserTypeResult>
  abstract browserSelect(
    params: {
      element: string
      value: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserSelectResult>
  abstract browserScroll(
    params: { direction: 'up' | 'down'; amount?: number } & BrowserCommandTargetParams
  ): Promise<BrowserScrollResult>
  abstract browserBack(params: BrowserCommandTargetParams): Promise<BrowserBackResult>
  abstract browserReload(params: BrowserCommandTargetParams): Promise<BrowserReloadResult>
  abstract browserScreenshot(
    params: {
      format?: 'png' | 'jpeg'
    } & BrowserCommandTargetParams
  ): Promise<BrowserScreenshotResult>
  abstract browserScreencast(
    params: BrowserScreencastParams,
    options: {
      connectionId?: string
      sendBinary?: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
      signal?: AbortSignal
      emit: (result: BrowserScreencastResult) => void
    }
  ): Promise<void>
  abstract browserEval(
    params: { expression: string } & BrowserCommandTargetParams
  ): Promise<BrowserEvalResult>
  abstract browserTabList(params: { worktree?: string }): Promise<BrowserTabListResult>
  abstract browserProceedCertificate(
    params: { challengeId: string } & BrowserCommandTargetParams
  ): Promise<BrowserCertificateProceedResult>
  abstract browserTabShow(params: {
    page: string
    worktree?: string
  }): Promise<BrowserTabShowResult>
  abstract browserTabCurrent(params: { worktree?: string }): Promise<BrowserTabCurrentResult>
  abstract browserTabSwitch(
    params: {
      index?: number
      focus?: boolean
    } & BrowserCommandTargetParams
  ): Promise<BrowserTabSwitchResult>
  abstract browserHover(
    params: { element: string } & BrowserCommandTargetParams
  ): Promise<BrowserHoverResult>
  abstract browserDrag(
    params: {
      from: string
      to: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserDragResult>
  abstract browserUpload(
    params: { element: string; files: string[] } & BrowserCommandTargetParams
  ): Promise<BrowserUploadResult>
  abstract browserWait(
    params: {
      selector?: string
      timeout?: number
      text?: string
      url?: string
      load?: string
      fn?: string
      state?: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserWaitResult>
  abstract browserCheck(
    params: { element: string; checked: boolean } & BrowserCommandTargetParams
  ): Promise<BrowserCheckResult>
  abstract browserFocus(
    params: { element: string } & BrowserCommandTargetParams
  ): Promise<BrowserFocusResult>
  abstract browserClear(
    params: { element: string } & BrowserCommandTargetParams
  ): Promise<BrowserClearResult>
  abstract browserSelectAll(
    params: { element: string } & BrowserCommandTargetParams
  ): Promise<BrowserSelectAllResult>
  abstract browserKeypress(
    params: { key: string } & BrowserCommandTargetParams
  ): Promise<BrowserKeypressResult>
  abstract browserPdf(params: BrowserCommandTargetParams): Promise<BrowserPdfResult>
  abstract browserFullScreenshot(
    params: {
      format?: 'png' | 'jpeg'
    } & BrowserCommandTargetParams
  ): Promise<BrowserScreenshotResult>
  abstract browserCookieGet(
    params: { url?: string } & BrowserCommandTargetParams
  ): Promise<BrowserCookieGetResult>
  abstract browserCookieSet(
    params: {
      name: string
      value: string
      domain?: string
      path?: string
      secure?: boolean
      httpOnly?: boolean
      sameSite?: string
      expires?: number
    } & BrowserCommandTargetParams
  ): Promise<BrowserCookieSetResult>
  abstract browserCookieDelete(
    params: {
      name: string
      domain?: string
      url?: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserCookieDeleteResult>
  abstract browserSetViewport(
    params: {
      width: number
      height: number
      deviceScaleFactor?: number
      mobile?: boolean
    } & BrowserCommandTargetParams
  ): Promise<BrowserViewportResult>
  abstract browserSetGeolocation(
    params: {
      latitude: number
      longitude: number
      accuracy?: number
    } & BrowserCommandTargetParams
  ): Promise<BrowserGeolocationResult>
  abstract browserInterceptEnable(
    params: {
      patterns?: string[]
    } & BrowserCommandTargetParams
  ): Promise<BrowserInterceptEnableResult>
}
import type { BrowserCommandTargetParams } from './runtime-browser-foundation'
