import type { JSX } from 'react'
import {
  buildSkillCommandForRuntime,
  ensureWslCliAvailableForAgentSkillTerminal,
  getWslCliDistroRequest
} from '~renderer/components/settings/cli-skill-runtime-setup'
import { useActiveProjectSkillRuntime } from '~renderer/hooks/use-active-project-skill-runtime'
import type { InstalledAgentSkillState } from '~renderer/hooks/use-installed-agent-skills'
import { translate } from '~renderer/i18n/i18n'
import {
  YIRU_CLI_SKILL_INSTALL_COMMAND,
  YIRU_CLI_SKILL_UPDATE_COMMAND
} from '~renderer/lib/agent-feature-install-commands'
import {
  AGENT_SKILL_CLI_PREREQUISITE_NOTICE,
  ensureYiruCliAvailableForAgentSkillTerminal
} from '~renderer/lib/agent-skill-cli-prerequisite'
import { BROWSER_USE_ENABLED_STORAGE_KEY } from '~renderer/lib/browser-use-setup-state'
import { readCliInstallStatus, readWslCliInstallStatus } from '~renderer/runtime/cli-install-client'
import { useAppStore } from '~renderer/store'

import { AgentSkillSetupPanel } from '../settings/agent/skill-setup-panel'

export function BrowserUseSkillSetupCard(props: {
  compact?: boolean
  terminalHeightPx?: number
  skill: InstalledAgentSkillState
}): JSX.Element {
  const { compact, terminalHeightPx, skill } = props
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const installCommand = !activeSkillRuntime.installDisabledReason
    ? buildSkillCommandForRuntime(YIRU_CLI_SKILL_INSTALL_COMMAND, activeSkillRuntime.agentRuntime)
    : YIRU_CLI_SKILL_INSTALL_COMMAND
  const updateCommand = !activeSkillRuntime.installDisabledReason
    ? buildSkillCommandForRuntime(YIRU_CLI_SKILL_UPDATE_COMMAND, activeSkillRuntime.agentRuntime)
    : YIRU_CLI_SKILL_UPDATE_COMMAND

  const handleBeforeOpenTerminal = async (): Promise<void> => {
    useAppStore.getState().recordFeatureInteraction('agent-browser-setup')
    await (activeSkillRuntime.agentRuntime?.runtime === 'wsl'
      ? ensureWslCliAvailableForAgentSkillTerminal(activeSkillRuntime.agentRuntime)
      : ensureYiruCliAvailableForAgentSkillTerminal())
    localStorage.setItem(BROWSER_USE_ENABLED_STORAGE_KEY, '1')
  }

  const setupPanel = (
    <AgentSkillSetupPanel
      className={compact ? 'w-full max-w-[520px]' : undefined}
      title={translate(
        'auto.components.feature.wall.BrowserUseSkillSetupCard.d5bb1cd4ba',
        'Browser Use skill'
      )}
      description={translate(
        'auto.components.feature.wall.BrowserUseSkillSetupCard.cbc45022d4',
        "Enables agents to navigate and verify pages in Yiru's browser."
      )}
      command={installCommand}
      installedCommand={updateCommand}
      terminalTitle="Browser Use setup"
      terminalAriaLabel="Browser Use skill install terminal"
      terminalWorktreeId="feature-wall-browser-use-skill-terminal"
      terminalShellOverride={activeSkillRuntime.terminalShellOverride}
      installed={skill.installed}
      loading={skill.loading}
      error={activeSkillRuntime.installDisabledReason ?? skill.error}
      installDisabled={Boolean(activeSkillRuntime.installDisabledReason)}
      terminalHeightPx={terminalHeightPx}
      preInstallNotice={AGENT_SKILL_CLI_PREREQUISITE_NOTICE}
      getPrerequisiteStatus={() =>
        activeSkillRuntime.agentRuntime?.runtime === 'wsl'
          ? readWslCliInstallStatus(getWslCliDistroRequest(activeSkillRuntime.agentRuntime))
          : readCliInstallStatus()
      }
      onBeforeOpenTerminal={handleBeforeOpenTerminal}
      showRecheckWhenInstalled={false}
      onRecheck={skill.refresh}
    />
  )

  if (compact) {
    return <div className="flex min-h-24 flex-1 items-center justify-center pt-3">{setupPanel}</div>
  }
  return <div className="flex">{setupPanel}</div>
}
