import type { AgentStatusState, AgentType } from '@yiru/workbench-model/agent'

export type TerminalColorOverrides = {
  foreground?: string
  background?: string
  cursor?: string
  cursorAccent?: string
  selectionBackground?: string
  selectionForeground?: string
  black?: string
  red?: string
  green?: string
  yellow?: string
  blue?: string
  magenta?: string
  cyan?: string
  white?: string
  brightBlack?: string
  brightRed?: string
  brightGreen?: string
  brightYellow?: string
  brightBlue?: string
  brightMagenta?: string
  brightCyan?: string
  brightWhite?: string
  // Why: xterm.js ITheme does not expose a `bold` key, but Ghostty users
  // expect the setting to be preserved so a future renderer CSS override
  // or xterm upgrade can honour it without a migration.
  bold?: string
}

export type RuntimeMobileTerminalTheme = {
  mode: 'dark' | 'light'
  theme: TerminalColorOverrides
}

export type RuntimeTerminalPathOpenTarget =
  | {
      kind: 'worktree-file'
      provider: 'local' | 'ssh'
      relativePath: string
      absolutePath: string
    }
  | {
      kind: 'absolute-file'
      provider: 'local' | 'ssh'
      absolutePath: string
      grantId: string
    }
  | {
      kind: 'unsupported'
      reason: string
    }

/** Result of resolving a file path tapped in the mobile terminal against the
 *  worktree root (+ optional cwd). relativePath is null when the path resolves
 *  outside the worktree (not openable via the worktree-scoped file RPCs). */
export type RuntimeTerminalPathResolution = {
  worktree: string
  relativePath: string | null
  /** Absolute on-disk path (or remote path), present when relativePath is.
   *  Used to build a file:// URL for opening HTML in a browser tab. */
  absolutePath: string | null
  exists: boolean
  isDirectory: boolean
  openTarget?: RuntimeTerminalPathOpenTarget
}

export type RuntimeWorktreeAgentRow = {
  paneKey: string
  /** paneKey of the orchestration parent, or null for a root agent. */
  parentPaneKey: string | null
  state: AgentStatusState
  agentType: AgentType | null
  /** Raw hook-reported prompt. Display surfaces can prefer displayName. */
  prompt: string
  /** Explicit orchestration task title, or null outside dispatch. */
  taskTitle: string | null
  /** Explicit UI label for orchestration task rows, or null outside dispatch. */
  displayName: string | null
  lastAssistantMessage: string | null
  toolName: string | null
  toolInput: string | null
  interrupted: boolean
  /** When the current `state` was first reported (ms). Drives "Xm ago". */
  stateStartedAt: number
  updatedAt: number
}

export type RuntimeGitLocalBranches = {
  current: string | null
  branches: string[]
}

/** One speech model as presented to the mobile dictation-setup sheet: catalog
 *  metadata joined with live download/ready state. */
export type RuntimeSpeechModelSummary = {
  id: string
  label: string
  provider: 'local' | 'openai'
  sizeBytes: number | null
  recommended: boolean
  status: 'ready' | 'not-downloaded' | 'downloading' | 'extracting' | 'error'
  progress: number | null
}

export type RuntimeSpeechSetupState = {
  enabled: boolean
  selectedModelId: string
  /** 'toggle' = press once to start/stop; 'hold' = dictate while held. */
  dictationMode: 'toggle' | 'hold'
  models: RuntimeSpeechModelSummary[]
}
