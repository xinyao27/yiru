import { z } from 'zod'

import type { AgentPhase } from '../model/agent-phase.js'
import type { TerminalOscLinkRange } from '../terminal-osc-link-ranges.js'

export type { AgentPhase } from '../model/agent-phase.js'

export type TerminalDriverState =
  | { kind: 'idle' }
  | { kind: 'desktop' }
  | { kind: 'mobile'; clientId: string }

export type TerminalSubscribedEvent = {
  type: 'subscribed'
  streamId: number | null
  lines: string[]
  truncated: boolean
  cols?: number
  rows?: number
  displayMode?: 'auto' | 'desktop'
  seq?: number
}

export type TerminalSubscribeEvent =
  | TerminalSubscribedEvent
  | {
      type: 'scrollback'
      lines: string[]
      truncated: boolean
      serialized?: string
      oscLinks?: TerminalOscLinkRange[]
      cwd?: string | null
      cols?: number
      rows?: number
      displayMode?: 'auto' | 'desktop'
      seq?: number
    }
  | { type: 'data'; chunk: string }
  | {
      type: 'fit-override-changed'
      // Why: a non-owning desktop viewer of a remotely-driven PTY resize gets
      // 'remote-desktop-fit' from `getRemoteDesktopFitHold`, not just the
      // mobile/desktop-owner pair — the renderer's own local event type
      // (terminal-multiplex/multiplexer.ts) already carries all three.
      mode: 'mobile-fit' | 'desktop-fit' | 'remote-desktop-fit'
      cols: number
      rows: number
    }
  | { type: 'end' }

export type TerminalMultiplexEvent =
  | { type: 'ready' }
  | { type: 'error'; streamId: number; message: string }
  | { type: 'end'; streamId: number }
  | {
      type: 'fit-override-changed'
      streamId: number
      // Why: see the equivalent field on TerminalSubscribeEvent above.
      mode: 'mobile-fit' | 'desktop-fit' | 'remote-desktop-fit'
      cols: number
      rows: number
    }
  | { type: 'driver-changed'; streamId: number; driver: TerminalDriverState }
  | {
      type: 'subscribed'
      streamId: number
      terminal: string
      cols?: number
      rows?: number
      displayMode: 'auto' | 'desktop'
      seq?: number
      truncated: boolean
    }

export type TerminalOpenMultiplexResult = {
  bulkTicket: string
  bulkEndpoint: string
  expiresAt: number
  maxFrameBytes: number
}

export type TerminalSummary = {
  agentPhase?: AgentPhase | null
  handle: string
  ptyId: string | null
  worktreeId: string
  worktreeInstanceId?: string | null
  worktreePath: string
  branch: string
  tabId: string
  leafId: string
  title: string | null
  connected: boolean
  writable: boolean
  lastOutputAt: number | null
  preview: string
}

export type TerminalVisualTerminalNode = {
  type: 'terminal'
  handle: string
  tabId: string
  leafId: string
  title: string | null
  connected: boolean
  active: boolean
}

export type TerminalVisualPaneNode =
  | TerminalVisualTerminalNode
  | {
      type: 'pane-split'
      direction: 'horizontal' | 'vertical'
      first: TerminalVisualPaneNode
      second: TerminalVisualPaneNode
    }

export type TerminalVisualTab = {
  tabId: string
  title: string | null
  activeLeafId: string | null
  panes: TerminalVisualPaneNode
}

export type TerminalVisualGroupNode = {
  type: 'group'
  groupId: string | null
  activeTabId: string | null
  tabs: TerminalVisualTab[]
}

export type TerminalVisualLayoutNode =
  | TerminalVisualGroupNode
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      first: TerminalVisualLayoutNode
      second: TerminalVisualLayoutNode
    }

export type TerminalVisualLayout = {
  worktreeId: string
  worktreePath: string
  root: TerminalVisualLayoutNode
}

export type TerminalListResult = {
  terminals: TerminalSummary[]
  visualLayouts?: TerminalVisualLayout[]
  totalCount: number
  truncated: boolean
}

export type TerminalShow = TerminalSummary & {
  paneRuntimeId: number
  ptyId: string | null
  rendererGraphEpoch: number
  transportGeneration: string
}

export type TerminalState = 'running' | 'exited' | 'unknown'

export type TerminalRead = {
  handle: string
  status: TerminalState
  tail: string[]
  truncated: boolean
  limited?: boolean
  oldestCursor?: string
  nextCursor: string | null
  latestCursor?: string
  returnedLineCount?: number
}

export type TerminalRename = {
  handle: string
  tabId: string
  title: string | null
}

export type TerminalSend = {
  handle: string
  accepted: boolean
  bytesWritten: number
  refusedReason?: 'no-agent' | 'permission'
}

export type TerminalAgentStatus = {
  agentPhase?: AgentPhase | null
  handle: string
  isRunningAgent: boolean
  status: 'working' | 'permission' | 'idle' | null
}

export type TerminalCreate = {
  handle: string
  tabId?: string
  paneKey?: string | null
  ptyId?: string | null
  worktreeId: string
  title: string | null
  surface?: 'background' | 'visible'
  warning?: string
  transportGeneration: string
  isReattach: boolean
  sessionExpired: boolean
  restore: {
    kind: 'none' | 'snapshot' | 'replay' | 'cold-restore'
    isAlternateScreen: boolean
    snapshotCols?: number
    snapshotRows?: number
    cwd?: string
    startupCwdFallback?: {
      kind: 'worktree'
      cwd: string
    }
  }
  providerSequence?: {
    value: string
    generation: 'continued' | 'reset'
  }
}

export type TerminalSplit = {
  handle: string
  tabId: string
  paneRuntimeId: number
}

export type TerminalResolvePane = {
  handle: string
  tabId: string
  leafId: string
  ptyId: string | null
}

export type TerminalFocus = {
  handle: string
  tabId: string
  worktreeId: string
}

export type TerminalClose = {
  handle: string
  tabId: string
  closeMode?: 'tab'
  ptyKilled: boolean
}

export type TerminalWait = {
  handle: string
  condition: 'exit' | 'tui-idle'
  satisfied: boolean
  status: TerminalState
  exitCode: number | null
  blockedReason?:
    | 'codex-update-prompt'
    | 'codex-trust-workspace'
    | 'codex-cwd-prompt'
    | 'codex-model-migration-prompt'
    | 'codex-hooks-review-prompt'
    | 'codex-interactive-prompt'
}

export type TerminalResolveActiveResult = { handle: string }
export type TerminalResolvePaneResult = { terminal: TerminalResolvePane }
export type TerminalShowResult = { terminal: TerminalShow }
export type TerminalReadResult = { terminal: TerminalRead }
export type TerminalProcessInspectionResult = {
  process: { foregroundProcess: string | null; hasChildProcesses: boolean }
}
export type TerminalIsRunningAgentResult = { isRunningAgent: boolean }
export type TerminalAgentStatusResult = { agentStatus: TerminalAgentStatus }
export type TerminalRenameResult = { rename: TerminalRename }
export type TerminalClearBufferResult = { clear: { handle: string; cleared: boolean } }
export type TerminalSendResult = { send: TerminalSend }
export type TerminalWaitResult = { wait: TerminalWait }
export type TerminalCreateResult = { terminal: TerminalCreate }
export type TerminalSplitResult = { split: TerminalSplit }
export type TerminalStopResult = { stopped: number }

export type TerminalStopExactResult = {
  stopped: number
  stoppedPtyIds: string[]
  livePtyIds: string[]
  postStopVerified: boolean
  postStopFailure?: string
  remainingLivePtyIds?: string[]
}

export type TerminalResizeForClientResult = {
  terminal: {
    handle: string
    cols: number
    rows: number
    previousCols: number | null
    previousRows: number | null
    mode: 'mobile-fit' | 'desktop-fit'
  }
}

export type TerminalFocusResult = { focus: TerminalFocus }
export type TerminalCloseResult = { close: TerminalClose }
export const TerminalSetDisplayModeResultSchema = z.object({
  mode: z.enum(['auto', 'desktop']),
  seq: z.number().optional()
})

export type TerminalSetDisplayModeResult = z.infer<typeof TerminalSetDisplayModeResultSchema>
export type TerminalRestoreFitResult = { restored: boolean }
export type TerminalGetDisplayModeResult = {
  mode: 'auto' | 'desktop'
  isPhoneFitted: boolean
}
export type TerminalUpdateViewportResult = { updated: boolean; applied: boolean; seq?: number }
export type TerminalUnsubscribeResult = { unsubscribed: true }
export type TerminalAutoRestoreFitResult = { ms: number | null }
