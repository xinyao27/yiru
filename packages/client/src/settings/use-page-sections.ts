import {
  COMPUTER_USE_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
} from '~renderer/agent/feature-install-commands'
import { useActiveProjectSkillRuntime } from '~renderer/skills/use-active-project-runtime'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill
} from '~renderer/skills/use-installed-agents'
import { useSkillFreshness } from '~renderer/skills/use-skill-freshness'

import type { SettingsNavInstallStatus } from './navigation-types'
import { getSkillNavInstallStatus } from './page-navigation'
import { getSettingsSectionSearchEntries, rankSettingsSearchItems } from './search'
import { useSettingsNavigationMetadata } from './use-navigation-metadata'

export function usePageSections(args: {
  hasUnsavedSourceControlAiPromptChanges: boolean
  query: string
}) {
  const baseSections = useSettingsNavigationMetadata()
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const orchestrationSkill = useInstalledAgentSkill(ORCHESTRATION_SKILL_NAME, {
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const computerUseSkill = useInstalledAgentSkill(COMPUTER_USE_SKILL_NAME, {
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const { inventory } = useSkillFreshness()
  const applicableInventory = activeSkillRuntime.agentRuntime?.runtime === 'wsl' ? null : inventory
  const installStatusBySectionId = new Map<string, SettingsNavInstallStatus>([
    [
      'orchestration',
      getSkillNavInstallStatus({
        name: ORCHESTRATION_SKILL_NAME,
        installed: orchestrationSkill.installed,
        loading: orchestrationSkill.loading,
        inventory: applicableInventory
      })
    ]
  ])
  installStatusBySectionId.set(
    'computer-use',
    getSkillNavInstallStatus({
      name: COMPUTER_USE_SKILL_NAME,
      installed: computerUseSkill.installed,
      loading: computerUseSkill.loading,
      inventory: applicableInventory
    })
  )

  const sections = baseSections.map((section) => {
    const installStatus = installStatusBySectionId.get(section.id)
    return installStatus ? { ...section, installStatus } : section
  })
  const sectionById = new Map(sections.map((section) => [section.id, section] as const))
  const visibleSections = (() => {
    const rankedSections = rankSettingsSearchItems(
      args.query,
      sections,
      getSettingsSectionSearchEntries
    ).map(({ item }) => item)
    if (
      !args.hasUnsavedSourceControlAiPromptChanges ||
      rankedSections.some((section) => section.id === 'git')
    ) {
      return rankedSections
    }
    const gitSection = sectionById.get('git')
    return gitSection ? [...rankedSections, gitSection] : rankedSections
  })()

  return {
    getSearchEntries: (sectionId: string) => {
      const section = sectionById.get(sectionId)
      return section ? getSettingsSectionSearchEntries(section) : []
    },
    sections,
    visibleSections
  }
}
