import {
  DEFAULT_TUI_AGENT_ARGS,
  DEFAULT_TUI_AGENT_ENV,
  hasUnsupportedTuiAgentArgs,
  normalizeTuiAgentArgsRecord,
  normalizeTuiAgentEnvRecord
} from '../../shared/tui-agent-launch-defaults'
import { normalizeDisabledTuiAgents } from '../../shared/tui-agent-selection'
import type { GlobalSettings } from '../../shared/types'

export type PersistedAgentSettingsDecodeResult = {
  settings: Pick<
    GlobalSettings,
    | 'agentDefaultArgs'
    | 'agentDefaultEnv'
    | 'agentYoloDefaultsMigrated'
    | 'disabledTuiAgents'
    | 'claudeAgentTeamsDefaultDisabledMigrated'
  >
  needsSave: boolean
}

function migrateAgentLaunchDefaults(
  settings: Partial<GlobalSettings>
): Pick<GlobalSettings, 'agentDefaultArgs' | 'agentDefaultEnv' | 'agentYoloDefaultsMigrated'> {
  const existingArgs = normalizeTuiAgentArgsRecord(settings.agentDefaultArgs)
  const existingEnv = normalizeTuiAgentEnvRecord(settings.agentDefaultEnv)
  if (settings.agentYoloDefaultsMigrated === true) {
    return {
      agentDefaultArgs: existingArgs,
      agentDefaultEnv: existingEnv,
      agentYoloDefaultsMigrated: true
    }
  }

  const commandOverrides = settings.agentCmdOverrides ?? {}
  const agentDefaultArgs = { ...existingArgs }
  for (const [agent, args] of Object.entries(DEFAULT_TUI_AGENT_ARGS)) {
    if (agent in agentDefaultArgs) {
      continue
    }
    agentDefaultArgs[agent as keyof typeof DEFAULT_TUI_AGENT_ARGS] =
      agent in commandOverrides ? '' : args
  }

  const agentDefaultEnv = { ...existingEnv }
  for (const [agent, env] of Object.entries(DEFAULT_TUI_AGENT_ENV)) {
    if (agent in agentDefaultEnv) {
      continue
    }
    // Why: command overrides were the only legacy customization surface, so
    // those agents must not silently inherit new launch defaults on upgrade.
    agentDefaultEnv[agent as keyof typeof DEFAULT_TUI_AGENT_ENV] =
      agent in commandOverrides ? {} : { ...env }
  }
  return { agentDefaultArgs, agentDefaultEnv, agentYoloDefaultsMigrated: true }
}

export function decodePersistedAgentSettings(
  value: Partial<GlobalSettings> | undefined
): PersistedAgentSettingsDecodeResult {
  const settings = value ?? {}
  const agentDefaults = migrateAgentLaunchDefaults(settings)
  const teamsMigrationComplete = settings.claudeAgentTeamsDefaultDisabledMigrated === true
  const disabledTuiAgents = normalizeDisabledTuiAgents(settings.disabledTuiAgents)
  if (!teamsMigrationComplete && !disabledTuiAgents.includes('claude-agent-teams')) {
    disabledTuiAgents.push('claude-agent-teams')
  }

  return {
    settings: {
      ...agentDefaults,
      disabledTuiAgents,
      claudeAgentTeamsDefaultDisabledMigrated: true
    },
    needsSave:
      !teamsMigrationComplete ||
      settings.agentYoloDefaultsMigrated !== true ||
      hasUnsupportedTuiAgentArgs('opencode', settings.agentDefaultArgs?.opencode) ||
      hasUnsupportedTuiAgentArgs('kilo', settings.agentDefaultArgs?.kilo)
  }
}
