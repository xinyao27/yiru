import type { SkillFreshnessInventory } from '@yiru/runtime-protocol/workbench/skill-freshness'
import {
  skillDirectoryName,
  type SkillDiscoveryResult
} from '@yiru/runtime-protocol/workbench/skills'

import type { SkillCliInvocation } from './skill-cli-invocation'
import { skillUpdateFailedNames } from './skill-update-outcome'

export type SkillRunVerdictSources = {
  inventory: () => Promise<SkillFreshnessInventory>
  globalSkillLocks: () => Promise<ReadonlyMap<string, string>>
  globalDiscovery: () => Promise<SkillDiscoveryResult>
}

// Why: the freshness inventory only enumerates Yiru's own bundled names, so it
// cannot see a marketplace skill at all. Install and remove are judged from
// discovery, which lists whatever is actually in the global skill homes — keyed
// by install directory, because that is what the CLI names are.
function globalSkillNames(discovery: SkillDiscoveryResult): ReadonlySet<string> {
  return new Set(
    discovery.skills
      .filter((skill) => skill.sourceKind === 'home')
      .map((skill) => skillDirectoryName(skill).toLowerCase())
  )
}

/**
 * Names that did not land, re-read from disk — or null when this operation and
 * scope cannot be judged and the exit code is the only evidence.
 *
 * Why project scope is unjudged: a project install writes into the checkout the
 * CLI ran in, and re-scanning that tree would mean a second full discovery pass
 * per run for a placement no other Yiru surface reads. The exit code is enough
 * until a project-scoped skill list exists to compare against.
 */
export async function resolveSkillRunFailedNames(
  invocation: SkillCliInvocation,
  sources: SkillRunVerdictSources
): Promise<string[] | null> {
  switch (invocation.operation) {
    case 'update': {
      const [inventory, locks] = await Promise.all([
        sources.inventory(),
        sources.globalSkillLocks()
      ])
      return skillUpdateFailedNames(invocation.names, inventory.installations, locks)
    }
    case 'install': {
      if (invocation.scope.kind === 'project' || invocation.names.length === 0) {
        return null
      }
      const installed = globalSkillNames(await sources.globalDiscovery())
      return invocation.names.filter((name) => !installed.has(name.toLowerCase()))
    }
    case 'remove': {
      if (invocation.scope.kind === 'project') {
        return null
      }
      const installed = globalSkillNames(await sources.globalDiscovery())
      return invocation.names.filter((name) => installed.has(name.toLowerCase()))
    }
  }
}
