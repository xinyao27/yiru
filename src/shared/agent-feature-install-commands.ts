import { YIRU_GITHUB_REPOSITORY_URL } from './yiru-github-repository'

export const YIRU_SKILLS_REPOSITORY_URL = YIRU_GITHUB_REPOSITORY_URL

export const YIRU_CLI_SKILL_NAME = 'yiru-cli'
export const COMPUTER_USE_SKILL_NAME = 'computer-use'
export const ORCHESTRATION_SKILL_NAME = 'orchestration'
export const EPHEMERAL_VMS_SKILL_NAME = 'yiru-per-workspace-env'

export function buildAgentFeatureSkillInstallCommand(skillNames: readonly string[]): string {
  if (skillNames.length === 0) {
    throw new Error('At least one skill name is required.')
  }
  return `npx skills add ${YIRU_SKILLS_REPOSITORY_URL} --skill ${skillNames.join(' ')} --global`
}

export function buildAgentFeatureSkillUpdateCommand(skillName: string): string {
  const trimmedSkillName = skillName.trim()
  if (!trimmedSkillName) {
    throw new Error('A skill name is required.')
  }
  return `npx skills update ${trimmedSkillName} --global`
}

export const YIRU_CLI_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  YIRU_CLI_SKILL_NAME
])

export const YIRU_CLI_SKILL_UPDATE_COMMAND =
  buildAgentFeatureSkillUpdateCommand(YIRU_CLI_SKILL_NAME)

export const COMPUTER_USE_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  COMPUTER_USE_SKILL_NAME
])

export const COMPUTER_USE_SKILL_UPDATE_COMMAND =
  buildAgentFeatureSkillUpdateCommand(COMPUTER_USE_SKILL_NAME)

export const ORCHESTRATION_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCHESTRATION_SKILL_NAME
])

export const ORCHESTRATION_SKILL_UPDATE_COMMAND =
  buildAgentFeatureSkillUpdateCommand(ORCHESTRATION_SKILL_NAME)

export const EPHEMERAL_VMS_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  EPHEMERAL_VMS_SKILL_NAME
])

export const EPHEMERAL_VMS_SKILL_UPDATE_COMMAND =
  buildAgentFeatureSkillUpdateCommand(EPHEMERAL_VMS_SKILL_NAME)

export const YIRU_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  YIRU_CLI_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
])
