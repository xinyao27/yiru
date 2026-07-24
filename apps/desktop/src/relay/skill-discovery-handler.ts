import { discoverSkills } from '../main/skills/discovery'
import { SSH_SKILL_DISCOVERY_RELAY_CAPABILITY } from '../shared/skills'
import type { RelayDispatcher } from './dispatcher'

export function registerSkillDiscoveryHandlers(dispatcher: RelayDispatcher): void {
  dispatcher.onRequest('session.capabilities', async () => ({
    capabilities: [SSH_SKILL_DISCOVERY_RELAY_CAPABILITY]
  }))
  dispatcher.onRequest('skills.discover', async (params) => {
    const cwd = typeof params.cwd === 'string' ? params.cwd.trim() : ''
    if (!cwd) {
      throw new Error('SSH skill discovery requires a workspace path.')
    }
    return discoverSkills({ cwd })
  })
}
