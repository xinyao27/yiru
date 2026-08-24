import type {
  BrowserAgentCommandResult,
  BrowserForwardResult,
  BrowserInterceptListResult,
  BrowserMouseClickResult
} from '@yiru/runtime-protocol/contract'
import type {
  BrowserCaptureStartResult,
  BrowserCaptureStopResult,
  BrowserClickResult,
  BrowserConsoleResult,
  BrowserDetectProfilesResult,
  BrowserInterceptDisableResult,
  BrowserNetworkLogResult,
  BrowserProfileClearDefaultCookiesResult,
  BrowserProfileCreateResult,
  BrowserProfileDeleteResult,
  BrowserProfileImportFromBrowserResult,
  BrowserProfileListResult,
  BrowserTabListResult,
  BrowserTabProfileCloneResult,
  BrowserTabProfileShowResult,
  BrowserTabSetProfileResult
} from '~shared/runtime-types'

import type { BrowserBackend } from '../browser/backend'
import { RuntimeBrowserCommandsContract1 } from './runtime-browser-commands-contract-1'

export abstract class RuntimeBrowserCommandsContract2 extends RuntimeBrowserCommandsContract1 {
  abstract browserInterceptDisable(
    params: BrowserCommandTargetParams
  ): Promise<BrowserInterceptDisableResult>
  abstract browserInterceptList(
    params: BrowserCommandTargetParams
  ): Promise<BrowserInterceptListResult>
  abstract browserCaptureStart(
    params: BrowserCommandTargetParams
  ): Promise<BrowserCaptureStartResult>
  abstract browserCaptureStop(params: BrowserCommandTargetParams): Promise<BrowserCaptureStopResult>
  abstract browserConsoleLog(
    params: { limit?: number } & BrowserCommandTargetParams
  ): Promise<BrowserConsoleResult>
  abstract browserNetworkLog(
    params: { limit?: number } & BrowserCommandTargetParams
  ): Promise<BrowserNetworkLogResult>
  abstract browserDblclick(
    params: { element: string } & BrowserCommandTargetParams
  ): Promise<BrowserClickResult>
  abstract browserForward(params: BrowserCommandTargetParams): Promise<BrowserForwardResult>
  abstract browserScrollIntoView(
    params: { element: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserGet(
    params: {
      what: string
      selector?: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserIs(
    params: { what: string; selector: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserKeyboardInsertText(
    params: { text: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserMouseMove(
    params: { x: number; y: number } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserMouseDown(
    params: { button?: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserMouseClick(
    params: {
      x: number
      y: number
      button?: string
      radius?: number
      modifiers?: ('cmd' | 'ctrl' | 'alt' | 'shift')[]
    } & BrowserCommandTargetParams
  ): Promise<BrowserMouseClickResult>
  abstract browserMouseUp(
    params: { button?: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserMouseWheel(
    params: {
      dy: number
      dx?: number
    } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserFind(
    params: {
      locator: string
      value: string
      action: string
      text?: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserSetDevice(
    params: { name: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserSetOffline(
    params: { state?: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserSetHeaders(
    params: { headers: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserSetCredentials(
    params: {
      user: string
      pass: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserSetMedia(
    params: {
      colorScheme?: string
      reducedMotion?: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserClipboardRead(
    params: BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserClipboardWrite(
    params: { text: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserDialogAccept(
    params: { text?: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserDialogDismiss(
    params: BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserStorageLocalGet(
    params: { key: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserStorageLocalSet(
    params: {
      key: string
      value: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserStorageLocalClear(
    params: BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserStorageSessionGet(
    params: { key: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserStorageSessionSet(
    params: {
      key: string
      value: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserStorageSessionClear(
    params: BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserDownload(
    params: {
      selector: string
      path: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserHighlight(
    params: { selector: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserExec(
    params: { command: string } & BrowserCommandTargetParams
  ): Promise<BrowserAgentCommandResult>
  abstract browserTabCreate(
    params: {
      browserPageId?: string
      url?: string
      worktree?: string
      profileId?: string
      waitForRegistration?: boolean
      activate?: boolean
      targetGroupId?: string
    },
    context?: { shellConnectionId?: string }
  ): Promise<{ browserPageId: string }>
  abstract browserTabSetProfile(
    params: {
      profileId: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserTabSetProfileResult>
  abstract browserTabProfileShow(params: {
    page: string
    worktree?: string
  }): Promise<BrowserTabProfileShowResult>
  abstract browserTabProfileClone(
    params: {
      profileId: string
    } & BrowserCommandTargetParams
  ): Promise<BrowserTabProfileCloneResult>
  abstract browserProfileList(): Promise<BrowserProfileListResult>
  abstract browserProfileCreate(params: {
    label: string
    scope: 'isolated' | 'imported'
  }): Promise<BrowserProfileCreateResult>
  abstract browserProfileDelete(params: { profileId: string }): Promise<BrowserProfileDeleteResult>
  abstract browserProfileDetectBrowsers(): Promise<BrowserDetectProfilesResult>
  abstract browserProfileImportFromBrowser(params: {
    profileId: string
    browserFamily: string
    browserProfile?: string
  }): Promise<BrowserProfileImportFromBrowserResult>
  abstract browserProfileClearDefaultCookies(): Promise<BrowserProfileClearDefaultCookiesResult>
  abstract browserTabClose(params: {
    index?: number
    page?: string
    worktree?: string
  }): Promise<{ closed: boolean }>
  protected abstract enrichBrowserTabInfo(
    tab: BrowserTabListResult['tabs'][number]
  ): BrowserTabListResult['tabs'][number]
  protected abstract describeBrowserTab(
    browserPageId: string,
    explicitWorktreeId?: string
  ): BrowserTabListResult['tabs'][number]
  protected abstract createBrowserTabOffscreen(
    backend: BrowserBackend,
    url: string,
    worktreeId?: string,
    profileId?: string,
    activate?: boolean,
    targetGroupId?: string,
    requestedBrowserPageId?: string,
    shellConnectionId?: string
  ): Promise<{ browserPageId: string }>
  protected abstract createBrowserTabInRenderer(
    url: string,
    worktreeId: string | undefined,
    profileId: string | undefined,
    sessionPartition: string | undefined,
    activate?: boolean
  ): Promise<{ browserPageId: string }>
}
import type { BrowserCommandTargetParams } from './runtime-browser-foundation'
