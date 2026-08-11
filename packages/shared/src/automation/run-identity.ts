import type { Automation } from '../automations-types'

type AutomationRunIdentityFields = Pick<Automation, 'projectId' | 'runContext'>

export function getAutomationLegacyRepoId(automation: Pick<Automation, 'projectId'>): string {
  return automation.projectId
}

export function getAutomationRunRepoId(automation: AutomationRunIdentityFields): string {
  return automation.runContext?.repoId ?? getAutomationLegacyRepoId(automation)
}
