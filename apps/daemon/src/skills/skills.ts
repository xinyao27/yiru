import type {
  SkillFreshnessInventory,
  SkillManageScope,
  SkillUpdateRun,
  SkillUpdateStartResult
} from '@yiru/runtime-protocol/workbench/skill-freshness'
import type { Repo } from '@yiru/runtime-protocol/workbench/types'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { publishSkillUpdateRunEvent } from '../runtime/skill-update-run-events'
import { SkillCliRunner } from './skill-cli-run'
import { discoverSkillsOnTarget, resolveSkillDiscoveryTarget } from './skill-discovery-target'
import { inventorySkillFreshness } from './skill-freshness-inventory'
import { resolveSkillRunFailedNames } from './skill-run-verdict'
import { readGloballyUpdatableSkillLocks } from './skill-update-registration'

// Why: the CLI run is one host-wide operation regardless of which transport
// (legacy RPC or oRPC) started it, so the runner and the repos it rescans
// against are module-level singletons rather than per-caller state.
let runner: SkillCliRunner | null = null
let latestRepos: readonly Repo[] = []

function getRunner(): SkillCliRunner {
  if (runner) {
    return runner
  }
  runner = new SkillCliRunner({
    rescanFailedNames: (invocation) =>
      resolveSkillRunFailedNames(invocation, {
        inventory: () => scanSkillFreshness(latestRepos),
        globalSkillLocks: readGloballyUpdatableSkillLocks,
        globalDiscovery: () =>
          discoverSkillsOnTarget(resolveSkillDiscoveryTarget(undefined), [...latestRepos])
      }),
    onState: (run) => publishSkillUpdateRunEvent({ type: 'run', run })
  })
  return runner
}

export function scanSkillFreshness(repos: readonly Repo[]): Promise<SkillFreshnessInventory> {
  return inventorySkillFreshness({
    currentAppVersion: getRuntimeHostPathsProvider().version(),
    repos: [...repos]
  })
}

// Why: the scope becomes the spawn cwd of a command that writes files, so a
// project scope is only honoured for a path the user already stored as a repo.
function resolveStoredScope(
  repos: readonly Repo[],
  scope: SkillManageScope
): SkillManageScope | null {
  if (scope.kind === 'global') {
    return scope
  }
  return repos.some((repo) => repo.path === scope.repoPath) ? scope : null
}

export function startSkillUpdateRun(
  names: readonly string[],
  repos: readonly Repo[]
): SkillUpdateStartResult {
  latestRepos = repos
  return getRunner().start({ operation: 'update', names: Array.isArray(names) ? names : [] })
}

export function startSkillInstallRun(
  request: { source: string; skillNames?: string[]; scope: SkillManageScope },
  repos: readonly Repo[]
): SkillUpdateStartResult {
  latestRepos = repos
  const scope = resolveStoredScope(repos, request.scope)
  if (!scope) {
    return { started: false, reason: 'invalid-scope' }
  }
  return getRunner().start({
    operation: 'install',
    source: request.source,
    skillNames: request.skillNames,
    scope
  })
}

export function startSkillRemoveRun(
  request: { names: string[]; scope: SkillManageScope },
  repos: readonly Repo[]
): SkillUpdateStartResult {
  latestRepos = repos
  const scope = resolveStoredScope(repos, request.scope)
  if (!scope) {
    return { started: false, reason: 'invalid-scope' }
  }
  return getRunner().start({ operation: 'remove', names: request.names, scope })
}

export function cancelSkillUpdateRun(): SkillUpdateRun {
  getRunner().cancel()
  return getRunner().getState()
}

export function acknowledgeSkillUpdateRun(): SkillUpdateRun {
  getRunner().acknowledge()
  return getRunner().getState()
}

export function getSkillUpdateRunState(): SkillUpdateRun {
  return getRunner().getState()
}
