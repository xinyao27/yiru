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
  BrowserViewportOverrideInput,
  RuntimeBrowserGuestEvent
} from '@yiru/runtime-protocol/contract'
import type { RuntimeWindowTarget } from '~main/runtime/host/renderer-target'
import type { RuntimeBrowserDriverState } from '~shared/runtime-types'
import type { BrowserCertificateProceedResult } from '~shared/types'

import type { AgentBrowserBridge } from '../browser/agent-browser-bridge'
import type { BrowserBackend } from '../browser/backend'

export type RuntimeBrowserCommandHost = {
  getAgentBrowserBridge(): AgentBrowserBridge | null
  resolveWorktreeSelector(selector: string): Promise<{ id: string; path: string }>
  resolveBrowserFilePath(path: string): Promise<string>
  getAuthoritativeWindow(): RuntimeWindowTarget
  getAvailableAuthoritativeWindow(): RuntimeWindowTarget | null
  // Why: headless serve has no renderer window; browser pages are backed by a
  // main-process offscreen backend instead. Null when offscreen browsing is
  // unavailable (e.g. environment can't support it), which keeps capability
  // reporting honest.
  getBrowserBackend(): BrowserBackend | null
  // Why: the session-tab snapshot is the source of truth for which tab is
  // focused. A headless browser create must mark itself active there so paired
  // clients keep focus on the new tab instead of the reconcile snapping back to
  // a terminal (whose activeTabType the snapshot still reports).
  markHeadlessBrowserSessionTabActive?(
    worktreeId: string | undefined,
    browserPageId: string,
    targetGroupId?: string
  ): void
  registerSubscriptionCleanup(
    subscriptionId: string,
    cleanup: () => void | Promise<void>,
    connectionId?: string
  ): void
  cleanupSubscription(subscriptionId: string): void
  notifyBrowserDriverChanged(browserPageId: string, driver: RuntimeBrowserDriverState): void
  // Why: CDP-driven navigation has no renderer window in headless serve, and
  // paired clients have none at all — republish so `browser.guestEvents`
  // subscribers see the same address-bar/title change the shell does.
  emitBrowserGuestEvent(event: RuntimeBrowserGuestEvent): void
}

export type RuntimeBrowserShellAdapter = {
  browserPageRegister(
    input: BrowserPageRegisterInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserControlBooleanResult>
  browserPageUnregister(
    input: BrowserPageUnregisterInput,
    shellConnectionId: string | undefined
  ): BrowserControlBooleanResult
  browserPageSetActive(
    input: BrowserPageIdInput,
    shellConnectionId: string | undefined
  ): BrowserControlBooleanResult
  browserOpenDevTools(
    input: BrowserPageIdInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserControlBooleanResult>
  browserSetViewportOverride(
    input: BrowserViewportOverrideInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserControlBooleanResult>
  browserSetAnnotationViewport(
    input: BrowserAnnotationViewportInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserControlBooleanResult>
  browserCancelDownload(
    input: BrowserDownloadCancelInput,
    shellConnectionId: string | undefined
  ): BrowserControlBooleanResult
  browserSetGrabMode(
    input: BrowserGrabSetModeInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserGrabSetModeResult>
  browserAwaitGrabSelection(
    input: BrowserGrabAwaitInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserGrabResult>
  browserCancelGrab(
    input: BrowserPageIdInput,
    shellConnectionId: string | undefined
  ): BrowserControlBooleanResult
  browserCaptureSelection(
    input: BrowserGrabCaptureInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserGrabCaptureResult>
  browserExtractHover(
    input: BrowserPageIdInput,
    shellConnectionId: string | undefined
  ): Promise<BrowserGrabExtractResult>
  browserProceedCertificate(
    browserPageId: string,
    challengeId: string
  ): BrowserCertificateProceedResult
  waitForTabRegistration(browserPageId: string): Promise<void>
  waitForWorktreeTabRegistration(worktreeId: string | undefined): Promise<void>
}
