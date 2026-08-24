import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'
import type { ClaudeAgentTeamsMode } from '~shared/claude-agent-teams-tmux-compat'
import type { RuntimeTerminalPresentation } from '~shared/runtime-types'
import { getTuiAgentLaunchCommand, TUI_AGENT_CONFIG } from '~shared/tui-agent/config'
import { isTuiAgentEnabled } from '~shared/tui-agent/selection'
import type { WorktreeStartupLaunch, TuiAgent } from '~shared/types'

export type TerminalCreateOptions = {
  cols?: number
  rows?: number
  command?: string
  claudeAgentTeamsSourceCommand?: string
  cwd?: string
  cwdFallback?: 'worktree'
  env?: Record<string, string>
  envToDelete?: string[]
  launchConfig?: WorktreeStartupLaunch['launchConfig']
  launchToken?: string
  launchAgent?: TuiAgent
  startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
  telemetry?: WorktreeStartupLaunch['telemetry']
  title?: string
  focus?: boolean
  rendererBacked?: boolean
  activate?: boolean
  presentation?: RuntimeTerminalPresentation
  tabId?: string
  leafId?: string
  sessionId?: string
  persistHostSessionBinding?: boolean
  // Why: the headless mobile-session create publishes its own authoritative
  // snapshot (with the correct target group) right after spawn. Skip the
  // intermediate pty-backed publish so the new tab doesn't briefly flash in
  // the wrong (active) group before the corrected snapshot lands.
  deferMobileSessionPublish?: boolean
  /** Why: Coworking grants can be revoked during async launch preparation. */
  beforeSpawn?: () => void | Promise<void>
  /** Why: agent trust persistence is also a launch side effect, before PTY spawn. */
  beforeAgentTrust?: () => void | Promise<void>
}

export type PtyForegroundAgentRefresh = {
  promise: Promise<boolean>
  startedAfterTitleObservation: number
  requestedAfterTitleObservation: number
}

export function copySleepingAgentLaunchConfig(
  config: SleepingAgentLaunchConfig
): SleepingAgentLaunchConfig {
  return {
    ...(config.agentCommand ? { agentCommand: config.agentCommand } : {}),
    agentArgs: config.agentArgs,
    agentEnv: { ...config.agentEnv },
    ...(config.ompResumeFilePath ? { ompResumeFilePath: config.ompResumeFilePath } : {})
  }
}

export function mergeTerminalEnvDeletions(
  ...lists: readonly (readonly string[] | undefined)[]
): string[] | undefined {
  const merged = [...new Set(lists.flatMap((list) => list ?? []))]
  return merged.length > 0 ? merged : undefined
}

export function normalizeAgentLaunchCommandForMatch(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

export function resolveBareAgentLaunchCommand(args: {
  command: string | undefined
  settings: {
    agentCmdOverrides?: Partial<Record<TuiAgent, string>> | null
    disabledTuiAgents?: Iterable<unknown> | null
  }
  platform: NodeJS.Platform
  isRemote: boolean
}): TuiAgent | null {
  const command = args.command ? normalizeAgentLaunchCommandForMatch(args.command) : ''
  if (!command) {
    return null
  }

  const cmdOverrides = args.settings.agentCmdOverrides ?? {}
  for (const agent of Object.keys(TUI_AGENT_CONFIG) as TuiAgent[]) {
    if (!isTuiAgentEnabled(agent, args.settings.disabledTuiAgents)) {
      continue
    }
    const override = cmdOverrides[agent]?.trim()
    const defaultLaunchCommand = getTuiAgentLaunchCommand(TUI_AGENT_CONFIG[agent], args.platform, {
      isRemote: args.isRemote
    })
    const launchCommands = override ? [defaultLaunchCommand, override] : [defaultLaunchCommand]
    if (
      launchCommands.some((candidate) => command === normalizeAgentLaunchCommandForMatch(candidate))
    ) {
      return agent
    }
  }

  return null
}

export function inferCapturedClaudeAgentTeamsMode(
  launchConfig: SleepingAgentLaunchConfig | undefined,
  command: string | undefined,
  currentMode: ClaudeAgentTeamsMode | undefined
): ClaudeAgentTeamsMode | undefined {
  const capturedCommand = launchConfig?.agentCommand?.trim() || command?.trim() || ''
  const capturedArgs = launchConfig?.agentArgs?.trim() ?? ''
  const capturedLaunch = `${capturedCommand} ${capturedArgs}`.trim()
  if (/(^|\s)--teammate-mode(?:=|\s+)auto(?:\s|$)/.test(capturedLaunch)) {
    return 'native-panes-shim'
  }
  if (/(^|\s)--teammate-mode(?:=|\s+)in-process(?:\s|$)/.test(capturedLaunch)) {
    return 'in-process'
  }
  if (launchConfig && /(^|\s)--resume(?:\s|=|$)/.test(command?.trim() ?? '')) {
    return 'off'
  }
  return currentMode
}

export type MobileSessionTerminalCommand = {
  command?: string
  env?: Record<string, string>
  envToDelete?: string[]
  startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
  launchConfig?: SleepingAgentLaunchConfig
  launchAgent?: TuiAgent
}
