import type { TabGroupLayoutNode, TerminalPaneLayoutNode } from '../types'

export type RuntimeTerminalSummary = {
  handle: string
  ptyId: string | null
  worktreeId: string
  /** Missing legacy summaries fail closed at consumers that require an instance binding. */
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

export type RuntimeTerminalVisualTerminalNode = {
  type: 'terminal'
  handle: string
  tabId: string
  leafId: string
  title: string | null
  connected: boolean
  active: boolean
}

export type RuntimeTerminalVisualPaneNode =
  | RuntimeTerminalVisualTerminalNode
  | {
      type: 'pane-split'
      direction: Extract<TerminalPaneLayoutNode, { type: 'split' }>['direction']
      first: RuntimeTerminalVisualPaneNode
      second: RuntimeTerminalVisualPaneNode
    }

export type RuntimeTerminalVisualTab = {
  tabId: string
  title: string | null
  activeLeafId: string | null
  panes: RuntimeTerminalVisualPaneNode
}

export type RuntimeTerminalVisualGroupNode = {
  type: 'group'
  groupId: string | null
  activeTabId: string | null
  tabs: RuntimeTerminalVisualTab[]
}

export type RuntimeTerminalVisualLayoutNode =
  | RuntimeTerminalVisualGroupNode
  | {
      type: 'split'
      direction: Extract<TabGroupLayoutNode, { type: 'split' }>['direction']
      first: RuntimeTerminalVisualLayoutNode
      second: RuntimeTerminalVisualLayoutNode
    }

export type RuntimeTerminalVisualLayout = {
  worktreeId: string
  worktreePath: string
  root: RuntimeTerminalVisualLayoutNode
}

export type RuntimeTerminalListResult = {
  terminals: RuntimeTerminalSummary[]
  visualLayouts?: RuntimeTerminalVisualLayout[]
  totalCount: number
  truncated: boolean
}

export type RuntimeTerminalShow = RuntimeTerminalSummary & {
  paneRuntimeId: number
  ptyId: string | null
  rendererGraphEpoch: number
  transportGeneration: string
}

export type RuntimeTerminalState = 'running' | 'exited' | 'unknown'

export type RuntimeTerminalRead = {
  handle: string
  status: RuntimeTerminalState
  tail: string[]
  truncated: boolean
  limited?: boolean
  oldestCursor?: string
  nextCursor: string | null
  latestCursor?: string
  returnedLineCount?: number
}

export type RuntimeTerminalRename = {
  handle: string
  tabId: string
  title: string | null
}

export type RuntimeTerminalSend = {
  handle: string
  accepted: boolean
  bytesWritten: number
  refusedReason?: 'no-agent' | 'permission'
}

export type RuntimeTerminalAgentStatusState = 'working' | 'permission' | 'idle' | null

export type RuntimeTerminalAgentStatus = {
  handle: string
  isRunningAgent: boolean
  status: RuntimeTerminalAgentStatusState
}

export type RuntimeTerminalPresentation = 'background' | 'focused'

export type RuntimeTerminalCreate = {
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

export type RuntimeTerminalSplit = {
  handle: string
  tabId: string
  paneRuntimeId: number
}

export type RuntimeTerminalResolvePane = {
  handle: string
  tabId: string
  leafId: string
  ptyId: string | null
}

export type RuntimeTerminalFocus = {
  handle: string
  tabId: string
  worktreeId: string
}

export type RuntimeTerminalClose = {
  handle: string
  tabId: string
  /** Present for the durable whole-tab lifecycle without changing legacy receipts. */
  closeMode?: 'tab'
  ptyKilled: boolean
}

export type RuntimeTerminalWaitCondition = 'exit' | 'tui-idle'
export type RuntimeTerminalWaitBlockedReason =
  | 'codex-update-prompt'
  | 'codex-trust-workspace'
  | 'codex-cwd-prompt'
  | 'codex-model-migration-prompt'
  | 'codex-hooks-review-prompt'
  | 'codex-interactive-prompt'

export type RuntimeTerminalWait = {
  handle: string
  condition: RuntimeTerminalWaitCondition
  satisfied: boolean
  status: RuntimeTerminalState
  exitCode: number | null
  blockedReason?: RuntimeTerminalWaitBlockedReason
}
