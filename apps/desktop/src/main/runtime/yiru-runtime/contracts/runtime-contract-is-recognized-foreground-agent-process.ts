import type { RuntimeWindowTarget } from '~main/runtime/host/renderer-target'
import type {
  RuntimeBrowserCommandHost,
  RuntimeBrowserCommands
} from '~main/runtime/yiru-runtime-browser'
import type { AgentStatus } from '~shared/agent/detection'
import type {
  RuntimeTerminalRead,
  RuntimeTerminalWait,
  RuntimeTerminalSummary
} from '~shared/runtime-types'

import type { RuntimeLeafRecord, RuntimePtyWorktreeRecord } from '../model/terminal-records'
import type {
  MessageWaitResult,
  MessageWaiter,
  TerminalHandleRecord,
  TerminalWaiter
} from '../model/terminal-startup'
import type { ResolvedWorktree } from '../model/worktree-resolution'
import { RuntimeContractSyncMobileSessionTabs } from './runtime-contract-sync-mobile-session-tabs'

export abstract class RuntimeContractIsRecognizedForegroundAgentProcess extends RuntimeContractSyncMobileSessionTabs {
  protected abstract isRecognizedForegroundAgentProcess(
    ptyId: string,
    foregroundProcess: string,
    options?: { suppressClaude?: boolean }
  ): Promise<boolean>

  protected abstract isAgentWrapperForegroundProcess(processName: string): boolean

  protected abstract getPrimaryLeafForPty(ptyId: string): RuntimeLeafRecord | null

  abstract deliverPendingMessagesForHandle(handle: string): void

  abstract notifyMessageArrived(handle: string, messageType?: string): void

  abstract waitForMessage(
    handle: string,
    options?: {
      typeFilter?: string[]
      timeoutMs?: number
      signal?: AbortSignal
      exclusive?: boolean
    }
  ): Promise<MessageWaitResult>

  abstract cancelMessageWaiters(handle: string): void

  protected abstract resolveMessageWaiter(waiter: MessageWaiter, result: MessageWaitResult): void

  protected abstract removeMessageWaiter(waiter: MessageWaiter): void

  protected abstract buildPtyTerminalSummary(
    pty: RuntimePtyWorktreeRecord,
    worktreesById: Map<string, ResolvedWorktree>
  ): RuntimeTerminalSummary

  protected abstract getLiveLeafForHandle(handle: string): {
    record: TerminalHandleRecord
    leaf: RuntimeLeafRecord
  }

  protected abstract getLivePtyForHandle(handle: string): {
    record: TerminalHandleRecord
    pty: RuntimePtyWorktreeRecord
  } | null

  protected abstract getRuntimeOwnedPtyForHandle(handle: string): {
    record: TerminalHandleRecord
    pty: RuntimePtyWorktreeRecord
  } | null

  protected abstract readPtyTerminal(
    handle: string,
    pty: RuntimePtyWorktreeRecord,
    opts?: { cursor?: number; limit?: number }
  ): RuntimeTerminalRead

  protected abstract issueHandle(leaf: RuntimeLeafRecord): string

  protected abstract issuePtyHandle(pty: RuntimePtyWorktreeRecord): string

  protected abstract resolveExitWaiters(leaf: RuntimeLeafRecord): void

  protected abstract resolveTuiIdleWaiters(leaf: RuntimeLeafRecord): void

  protected abstract resolvePtyExitWaiters(pty: RuntimePtyWorktreeRecord, ptyId: string): void

  protected abstract resolvePtyTuiIdleWaiters(pty: RuntimePtyWorktreeRecord, ptyId: string): void

  protected abstract startTuiIdleFallbackPoll(waiter: TerminalWaiter, leaf: RuntimeLeafRecord): void

  protected abstract startPtyTuiIdleFallbackPoll(
    waiter: TerminalWaiter,
    pty: RuntimePtyWorktreeRecord
  ): void

  protected abstract getAdoptedPtyExplicitIdleStatus(
    pty: RuntimePtyWorktreeRecord
  ): AgentStatus | null

  protected abstract deliverPendingMessages(leaf: RuntimeLeafRecord): void

  protected abstract resolveWaiter(waiter: TerminalWaiter, result: RuntimeTerminalWait): void

  protected abstract bindTerminalWaiterAbort(
    waiter: TerminalWaiter,
    signal: AbortSignal | undefined
  ): boolean

  protected abstract rejectWaitersForHandle(handle: string, code: string): void

  protected abstract rejectAllWaiters(code: string): void

  protected abstract removeWaiter(waiter: TerminalWaiter): void

  protected abstract getLeafKey(tabId: string, leafId: string): string

  abstract get browserCommands(): RuntimeBrowserCommands

  protected abstract createBrowserCommandHost(): RuntimeBrowserCommandHost

  protected abstract getAuthoritativeWindow(): RuntimeWindowTarget

  protected abstract getAvailableAuthoritativeWindow(): RuntimeWindowTarget | null
}
