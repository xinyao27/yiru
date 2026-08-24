import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'
import type {
  AgentTeamsTmuxCompatRequest,
  AgentTeamsTmuxCompatResponse
} from '~main/runtime/claude-agent-teams-service'
import type { TerminalPaneSplitSource } from '~shared/feature-education-telemetry'
import type {
  RuntimeTerminalSplit,
  RuntimeTerminalFocus,
  RuntimeTerminalClose,
  RuntimeMobileSessionCreateTerminalResult
} from '~shared/runtime-types'
import type { WorktreeStartupLaunch, TuiAgent } from '~shared/types'

import type { RuntimePtyWorktreeRecord } from '../model/terminal-records'
import { RuntimeContractResolveManagedPrBase } from './runtime-contract-resolve-managed-pr-base'

export abstract class RuntimeContractCreateHeadlessMobileSessionTerminal extends RuntimeContractResolveManagedPrBase {
  protected abstract createHeadlessMobileSessionTerminal(
    worktreeId: string,
    activate: boolean,
    afterTabId?: string,
    opts?: {
      command?: string
      cwd?: string
      env?: Record<string, string>
      envToDelete?: string[]
      startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
      identity?: { tabId: string; leafId: string; sessionId?: string }
      launchAgent?: TuiAgent
      targetGroupId?: string
      launchConfig?: SleepingAgentLaunchConfig
    }
  ): Promise<RuntimeMobileSessionCreateTerminalResult>

  protected abstract waitForMobileTerminalSurface(
    worktreeId: string,
    parentTabId: string,
    options?: { timeoutMs?: number; requireReady?: boolean; signal?: AbortSignal }
  ): Promise<RuntimeMobileSessionCreateTerminalResult>

  protected abstract findMobileTerminalSurface(
    worktreeId: string,
    parentTabId: string,
    options?: { requireReady?: boolean }
  ): RuntimeMobileSessionCreateTerminalResult | null

  protected abstract ensurePtyBackedMobileSurfaceForRendererTab(
    worktreeId: string,
    tabId: string
  ): RuntimeMobileSessionCreateTerminalResult | null

  protected abstract findLiveRegisteredPtyForRendererTab(
    worktreeId: string,
    tabId: string
  ): RuntimePtyWorktreeRecord | null

  protected abstract hasLiveShellForRendererTab(worktreeId: string, tabId: string): boolean

  protected abstract isReadyMobileTerminalSurface(
    surface: RuntimeMobileSessionCreateTerminalResult | null
  ): boolean

  protected abstract waitForTerminalHandle(tabId: string, timeoutMs?: number): Promise<string>

  abstract waitForLeafPtyId(
    handle: string,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<string>

  abstract requestRendererTerminalTabMount(
    handle: string,
    shellConnectionId: string | undefined
  ): Promise<boolean>

  protected abstract countLeavesInTab(tabId: string): number

  protected abstract resolveHandleForTab(tabId: string): string | null

  abstract focusTerminal(handle: string): Promise<RuntimeTerminalFocus>

  abstract closeTerminal(handle: string): Promise<RuntimeTerminalClose>

  abstract closeTerminalTab(handle: string): Promise<RuntimeTerminalClose>

  abstract splitTerminal(
    handle: string,
    opts?: {
      direction?: 'horizontal' | 'vertical'
      command?: string
      env?: Record<string, string>
      envToDelete?: string[]
      activate?: boolean
      telemetrySource?: TerminalPaneSplitSource
    }
  ): Promise<RuntimeTerminalSplit>

  protected abstract splitPtyBackedTerminal(
    pty: RuntimePtyWorktreeRecord,
    opts?: {
      direction?: 'horizontal' | 'vertical'
      command?: string
      env?: Record<string, string>
      envToDelete?: string[]
      activate?: boolean
      telemetrySource?: TerminalPaneSplitSource
    }
  ): Promise<RuntimeTerminalSplit>

  abstract handleAgentTeamsTmuxCompat(
    request: AgentTeamsTmuxCompatRequest
  ): Promise<AgentTeamsTmuxCompatResponse>

  abstract prepareClaudeAgentTeamsLeader(args: {
    paneKey: string
    baseEnv?: Record<string, string>
  }): Promise<{ env: Record<string, string> }>

  abstract prepareClaudeAgentTeamsLeaderForHandle(args: {
    handle: string
    baseEnv?: Record<string, string>
  }): Promise<{ env: Record<string, string> }>

  protected abstract waitForNewLeafInTab(
    tabId: string,
    existingLeafKeys: Set<string>,
    timeoutMs?: number
  ): Promise<string>

  abstract stopTerminalsForWorktree(
    worktreeSelector: string,
    options?: {
      deadline?: number
      stopPty?: (
        ptyId: string,
        stop: () => boolean | Promise<boolean>
      ) => Promise<{ stopped: boolean; owner: boolean }>
    }
  ): Promise<{ stopped: number }>

  abstract stopExactTerminalsForWorktree(
    worktreeSelector: string,
    expectedPtyIds: readonly string[],
    opts?: { keepHistory?: boolean; targetOnly?: boolean }
  ): Promise<{
    stopped: number
    stoppedPtyIds: string[]
    livePtyIds: string[]
    postStopVerified: boolean
    postStopFailure?: string
    remainingLivePtyIds?: string[]
  }>

  protected abstract getLivePtyIdsForWorktree(
    worktreeId: string,
    freshPtyIds?: ReadonlySet<string>
  ): Set<string>

  abstract hasTerminalsForWorktree(worktreeSelector: string): Promise<boolean>

  abstract markRendererReloading(windowId: number): void

  abstract markGraphReady(windowId: number): void

  abstract markGraphUnavailable(windowId: number): void

  protected abstract assertGraphReady(): void

  protected abstract captureReadyGraphEpoch(): number

  protected abstract assertStableReadyGraph(expectedGraphEpoch: number): void
}
