import type { SkillDiscoveryResult } from '../../../shared/skills'

export const INSTALLED_AGENT_SKILLS_CHANGED_EVENT = 'yiru:installed-agent-skills-changed'

export const cachedDiscoveryByTarget = new Map<string, SkillDiscoveryResult>()
export const pendingDiscoveryByTarget = new Map<string, Promise<SkillDiscoveryResult>>()
export const pendingDiscoverySatisfiesForcedRefreshByTarget = new Map<string, boolean>()

export function notifyInstalledAgentSkillsChanged(): void {
  cachedDiscoveryByTarget.clear()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(INSTALLED_AGENT_SKILLS_CHANGED_EVENT))
  }
}
