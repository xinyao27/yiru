import { eventIterator, type, type ContractRouter } from '@orpc/contract'
import type { SleepingAgentLaunchConfig, TuiAgent } from '@yiru/workbench-model/agent'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import type { TerminalDriverState } from './terminal-results.js'

export const ClientEventsUnsubscribeParamsSchema = z.object({
  subscriptionId: z
    .unknown()
    .transform((value) => (typeof value === 'string' && value.length > 0 ? value : ''))
    .pipe(z.string().min(1, 'Missing subscriptionId'))
})

export type ClientEventsUnsubscribeParams = z.infer<typeof ClientEventsUnsubscribeParamsSchema>
export type RuntimeClientEventsUnsubscribeResult = { unsubscribed: boolean }

export type RuntimeClientWorktreeSetupLaunch = {
  runnerScriptPath: string
  envVars: Record<string, string>
  command?: string
  waitForAgentStartup?: boolean
}

export type RuntimeClientWorktreeStartupLaunch = {
  command: string
  env?: Record<string, string>
  launchConfig?: SleepingAgentLaunchConfig
  launchToken?: string
  launchAgent?: TuiAgent
  startupCommandDelivery?: 'fast' | 'shell-ready'
  telemetry?: {
    agent_kind: Exclude<TuiAgent, 'claude'> | 'claude-code' | 'other'
    launch_source:
      | 'command_palette'
      | 'sidebar'
      | 'quick_command'
      | 'tab_bar_quick_launch'
      | 'task_page'
      | 'new_workspace_composer'
      | 'workspace_jump_palette'
      | 'shortcut'
      | 'onboarding'
      | 'diff_notes_send'
      | 'notes_send'
      | 'conflict_resolution'
      | 'source_control_recovery'
      | 'terminal_context_menu'
      | 'unknown'
    request_kind: 'new' | 'resume' | 'followup'
  }
}

export type RuntimeClientWorktreeDefaultTabsLaunch = {
  tabs: { title?: string; color?: string; command?: string }[]
  runCommands: boolean
}

// Head/branch snapshot read from Git metadata files without spawning Git.
// Mirrors `WorktreeHeadIdentity` (packages/shared/src/types.ts); kept as an
// independent literal here so this lower-level protocol never depends on @yiru/shared.
export type RuntimeClientWorktreeHeadIdentity = {
  worktreePath: string
  head: string
  /** Full ref (e.g. `refs/heads/main`), or null for a detached HEAD. */
  branch: string | null
}

export type RuntimeClientEvent =
  | { type: 'reposChanged' }
  | {
      type: 'worktreesChanged'
      repoId: string
      renamed?: { oldWorktreeId: string; newWorktreeId: string }
    }
  | {
      type: 'activateWorktree'
      repoId: string
      worktreeId: string
      setup?: RuntimeClientWorktreeSetupLaunch
      startup?: RuntimeClientWorktreeStartupLaunch
      defaultTabs?: RuntimeClientWorktreeDefaultTabsLaunch
    }
  | {
      type: 'worktreeHeadIdentitiesChanged'
      repoId: string
      identities: RuntimeClientWorktreeHeadIdentity[]
    }

export type RuntimeClientEventSubscriptionEvent =
  | {
      type: 'ready'
      subscriptionId: string
      snapshot?: { repos?: unknown[] }
    }
  | RuntimeClientEvent
  | { type: 'end' }

export const clientEventsContract = {
  subscribe: withAccess({ scope: 'host', tier: 'read' }, { mobile: true })
    .input(type<void>())
    .output(eventIterator(type<RuntimeClientEventSubscriptionEvent>())),
  unsubscribe: withAccess({ scope: 'host', tier: 'read' }, { mobile: true })
    .input(ClientEventsUnsubscribeParamsSchema)
    .output(type<RuntimeClientEventsUnsubscribeResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

// Cross-client ownership of a terminal or browser page. The shell learns this
// over IPC; paired clients need the same signal to know a driver moved away.
export type RuntimeDriverEvent =
  | { type: 'terminalDriverChanged'; ptyId: string; driver: TerminalDriverState }
  | { type: 'browserDriverChanged'; browserPageId: string; driver: TerminalDriverState }
  | {
      type: 'terminalFitOverrideChanged'
      ptyId: string
      mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit'
      cols: number
      rows: number
    }

export type RuntimeDriverSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeDriverEvent
  | { type: 'end' }

export const driverEventsContract = {
  subscribe: withAccess({ scope: 'host', tier: 'read' }, { mobile: true })
    .input(type<void>())
    .output(eventIterator(type<RuntimeDriverSubscriptionEvent>()))
} satisfies ContractRouter<RuntimeProcedureMeta>

// Long-running host work whose progress the shell renders as a spinner. Paired
// clients drive the same UI and need the same ticks.
export type RuntimeHostProgressEvent =
  | { type: 'repoCloneProgress'; phase: string; percent: number }
  | { type: 'worktreeCreateProgress'; creationId?: string; phase: 'fetching' | 'creating' }

export type RuntimeHostProgressSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeHostProgressEvent
  | { type: 'end' }

export const progressEventsContract = {
  subscribe: withAccess({ scope: 'host', tier: 'read' }, { mobile: true })
    .input(type<void>())
    .output(eventIterator(type<RuntimeHostProgressSubscriptionEvent>()))
} satisfies ContractRouter<RuntimeProcedureMeta>

export const runtimeNamespaceContract = {
  clientEvents: clientEventsContract,
  driverEvents: driverEventsContract,
  progressEvents: progressEventsContract
} satisfies ContractRouter<RuntimeProcedureMeta>
