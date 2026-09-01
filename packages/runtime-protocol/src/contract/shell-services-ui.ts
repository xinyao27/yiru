import { oc, type, type ContractRouter } from '@orpc/contract'

import type {
  RuntimeClientWorktreeDefaultTabsLaunch,
  RuntimeClientWorktreeSetupLaunch,
  RuntimeClientWorktreeStartupLaunch
} from './client-events.js'

type ShellServicesSessionTabMove =
  | {
      kind: 'reorder'
      tabId: string
      targetGroupId: string
      tabOrder: string[]
    }
  | {
      kind: 'move-to-group'
      tabId: string
      targetGroupId: string
      index?: number
    }
  | {
      kind: 'split'
      tabId: string
      targetGroupId: string
      splitDirection: 'left' | 'right' | 'up' | 'down'
    }

type ShellServicesTerminalSplitSource =
  | 'contextual_tour'
  | 'keyboard'
  | 'context_menu'
  | 'command'
  | 'unknown'

// Why: these commands mutate renderer-owned navigation, tab, and sleeping-agent
// state after the runtime has already completed its authoritative operation.
// They travel on the reverse link so the runtime retains only an opaque shell
// connection id, never a browser-page callback closure.
export type ShellServicesUICommandInput =
  | {
      type: 'activateWorktree'
      repoId: string
      worktreeId: string
      setup?: RuntimeClientWorktreeSetupLaunch
      startup?: RuntimeClientWorktreeStartupLaunch
      defaultTabs?: RuntimeClientWorktreeDefaultTabsLaunch
    }
  | {
      type: 'splitTerminal'
      tabId: string
      paneRuntimeId: number
      direction: 'horizontal' | 'vertical'
      command?: string
      telemetrySource?: ShellServicesTerminalSplitSource
    }
  | { type: 'renameTerminal'; tabId: string; title: string | null }
  | {
      type: 'focusTerminal'
      tabId: string
      worktreeId: string
      leafId?: string | null
      ackPaneKeyOnSuccess?: string
      flashFocusedPane?: boolean
      scrollToBottomIfOutputSinceLastView?: boolean
    }
  | { type: 'focusEditorTab'; tabId: string; worktreeId: string }
  | { type: 'closeSessionTab'; tabId: string; worktreeId: string }
  | ({ type: 'moveSessionTab'; worktreeId: string } & ShellServicesSessionTabMove)
  | {
      type: 'openFile'
      worktreeId: string
      filePath: string
      relativePath: string
      runtimeEnvironmentId?: string | null
    }
  | {
      type: 'openDiff'
      worktreeId: string
      filePath: string
      relativePath: string
      staged: boolean
      runtimeEnvironmentId?: string | null
    }
  | { type: 'closeTerminal'; tabId: string; paneRuntimeId?: number }
  | { type: 'sleepWorktree'; worktreeId: string }
  | { type: 'resumeSleepingAgents'; worktreeId: string }

export type ShellServicesUICommandOutput = { accepted: true }

export const shellServicesUIContract = {
  command: oc
    .input(type<ShellServicesUICommandInput>())
    .output(type<ShellServicesUICommandOutput>())
} satisfies ContractRouter<Record<never, never>>
