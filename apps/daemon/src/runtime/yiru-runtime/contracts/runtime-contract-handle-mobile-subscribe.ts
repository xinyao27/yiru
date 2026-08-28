import type { AgentStatus } from '@yiru/runtime-protocol/workbench/agent/detection'
import type {
  RuntimeTerminalRead,
  RuntimeTerminalAgentStatus,
  RuntimeTerminalSend,
  RuntimeTerminalListResult,
  RuntimeTerminalResolvePane,
  RuntimeTerminalShow,
  RuntimeTerminalSummary,
  RuntimeTerminalVisualGroupNode,
  RuntimeTerminalVisualLayout,
  RuntimeTerminalVisualLayoutNode,
  RuntimeTerminalVisualPaneNode,
  RuntimeTerminalVisualTab,
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionTabsSnapshot
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type {
  TabGroupLayoutNode,
  TerminalPaneLayoutNode,
  TuiAgent
} from '@yiru/runtime-protocol/workbench/types'
import type { ExactWorkerProviderSession } from '~main/orchestration/worker-output'

import type { RuntimeLeafRecord } from '../model/terminal-records'
import type { ResolvedWorktree } from '../model/worktree-resolution'
import { RuntimeContractGetTerminalFitOverride } from './runtime-contract-get-terminal-fit-override'

export abstract class RuntimeContractHandleMobileSubscribe extends RuntimeContractGetTerminalFitOverride {
  abstract handleMobileSubscribe(
    ptyId: string,
    clientId: string,
    viewport?: { cols: number; rows: number }
  ): Promise<boolean>

  protected abstract handleMobileSubscribeInternal(
    ptyId: string,
    clientId: string,
    viewport?: { cols: number; rows: number }
  ): Promise<boolean>

  abstract handleMobileUnsubscribe(ptyId: string, clientId: string): void

  abstract applyMobileDisplayMode(ptyId: string): Promise<boolean>

  abstract onExternalPtyResize(ptyId: string, cols: number, rows: number): void

  abstract recordRendererGeometry(ptyId: string, cols: number, rows: number): void

  protected abstract refreshRendererGeometry(ptyId: string, cols: number, rows: number): void

  abstract isResizeSuppressed(): boolean

  abstract subscribeToTerminalResize(
    ptyId: string,
    listener: (event: {
      cols: number
      rows: number
      displayMode: string
      reason: string
      seq?: number
    }) => void
  ): () => void

  protected abstract notifyTerminalResize(
    ptyId: string,
    event: { cols: number; rows: number; displayMode: string; reason: string; seq?: number }
  ): void

  protected abstract failActiveDispatchOnExit(leaf: RuntimeLeafRecord, exitCode: number): void

  abstract listTerminals(
    worktreeSelector?: string,
    limit?: number,
    opts?: { requireFreshPtyLiveness?: boolean }
  ): Promise<RuntimeTerminalListResult>

  protected abstract buildTerminalVisualLayouts(
    terminals: RuntimeTerminalSummary[],
    worktreesById: Map<string, ResolvedWorktree>,
    targetWorktreeId: string | null
  ): RuntimeTerminalVisualLayout[]

  protected abstract buildTerminalVisualGroups(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    summariesByLeafKey: ReadonlyMap<string, RuntimeTerminalSummary>
  ): RuntimeTerminalVisualGroupNode[]

  protected abstract buildTerminalVisualTab(
    tabId: string,
    surfaces: RuntimeMobileSessionTerminalTab[],
    summariesByLeafKey: ReadonlyMap<string, RuntimeTerminalSummary>
  ): RuntimeTerminalVisualTab | null

  protected abstract collectVisibleTerminalLeafIds(
    node: TerminalPaneLayoutNode,
    tabId: string,
    summariesByLeafKey: ReadonlyMap<string, RuntimeTerminalSummary>
  ): string[]

  protected abstract buildTerminalVisualPane(
    node: TerminalPaneLayoutNode,
    tabId: string,
    activeLeafId: string | null,
    summariesByLeafKey: ReadonlyMap<string, RuntimeTerminalSummary>
  ): RuntimeTerminalVisualPaneNode | null

  protected abstract buildTerminalVisualGroupLayout(
    node: TabGroupLayoutNode | null | undefined,
    groupsById: ReadonlyMap<string, RuntimeTerminalVisualGroupNode>
  ): RuntimeTerminalVisualLayoutNode | null

  abstract resolveActiveTerminal(worktreeSelector?: string): Promise<string>

  abstract getTerminalPaneKey(handle: string): string | null

  abstract getTerminalProcessIncarnation(handle: string): string | null

  abstract getExactWorkerProviderSession(
    handle: string,
    observedAfter: number
  ): ExactWorkerProviderSession | null

  abstract validateOrchestrationAgentLauncher(agent: TuiAgent): void

  abstract resolveTerminalPane(paneKey: string): RuntimeTerminalResolvePane

  abstract showTerminal(handle: string): Promise<RuntimeTerminalShow>

  abstract readTerminal(
    handle: string,
    opts?: { cursor?: number; limit?: number }
  ): Promise<RuntimeTerminalRead>

  abstract sendTerminal(
    handle: string,
    action: {
      text?: string
      enter?: boolean
      interrupt?: boolean
    },
    options?: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      reserveWrite?: (ptyId: string) => void
      afterWrite?: (ptyId: string) => void | Promise<void>
      suffixFailureError?: string
    }
  ): Promise<RuntimeTerminalSend>

  abstract sendTerminalAgentPrompt(
    handle: string,
    prompt: string,
    options?: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      suffixFailureError?: string
    }
  ): Promise<RuntimeTerminalSend>

  abstract getTerminalAgentStatus(handle: string): Promise<RuntimeTerminalAgentStatus>

  protected abstract getTerminalAgentStatusPtyId(handle: string): string

  protected abstract assertTerminalAgentStatusPtyBinding(
    handle: string,
    expectedPtyId: string
  ): void

  protected abstract getTerminalAgentStatusSnapshot(
    handle: string,
    expectedPtyId: string
  ): {
    waitText: string
    waitBlockedAt: number | null
    title: string | null
    titleStatus: AgentStatus | null
    titleStatusIsLive: boolean
  }

  protected abstract terminalHasShellForegroundProcess(
    handle: string,
    ptyId: string
  ): Promise<boolean>
}
