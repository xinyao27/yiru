import {
  PROJECT_HOST_SETUP_RUNTIME_CAPABILITY,
  WORKSPACE_RUN_CONTEXT_RUNTIME_CAPABILITY
} from '@yiru/runtime-protocol/capabilities'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId
} from '@yiru/workbench-model/workspace'
import { translate } from '~renderer/i18n/i18n'
import { syncRuntimeGitForkDefaultBranch } from '~renderer/runtime/git-client'
import { callRuntimeOrpc, isWebRuntimeClient } from '~renderer/runtime/orpc-client'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import {
  assertRuntimeEnvironmentCapability,
  getActiveRuntimeTarget
} from '~renderer/runtime/rpc-client'
import { shellClient } from '~renderer/runtime/shell-client'
import {
  projectHostSetupProjectionFromRepos,
  type ProjectHostSetupProjection
} from '~shared/project-host-setup-projection'
import type {
  GlobalSettings,
  Repo,
  ProjectGroup,
  ProjectHostSetup,
  ProjectHostSetupExistingFolderArgs
} from '~shared/types'

import type { AppState } from '../types'
import { settingsForRepoOwner } from './repo-path-status-model'
import {
  SAFE_AUTO_FORK_SYNC_COOLDOWN_MS,
  safeAutoForkSyncAttempts,
  getRuntimeTargetHostId
} from './repo-update-model'

export function getFirstPaintCatalogTarget(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): ReturnType<typeof getActiveRuntimeTarget> | null {
  if (!isWebRuntimeClient()) {
    return { kind: 'local' }
  }
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment' ? target : null
}

export function isEnvironmentAlreadyLoaded(
  firstPaintTarget: ReturnType<typeof getActiveRuntimeTarget> | null,
  environmentId: string
): boolean {
  return (
    firstPaintTarget?.kind === 'environment' && firstPaintTarget.environmentId === environmentId
  )
}

export function getProjectSetupRuntimeTarget(
  hostId: ProjectHostSetupExistingFolderArgs['hostId']
): ReturnType<typeof getActiveRuntimeTarget> {
  const parsedHost = parseExecutionHostId(hostId)
  return parsedHost?.kind === 'runtime'
    ? { kind: 'environment', environmentId: parsedHost.environmentId }
    : { kind: 'local' }
}

export function getProjectUpdateRuntimeTarget(
  state: AppState,
  projectId: string
): ReturnType<typeof getActiveRuntimeTarget> {
  const target = getActiveRuntimeTarget(state.settings)
  if (target.kind !== 'environment') {
    return target
  }
  const runtimeHostId = getRuntimeTargetHostId(target)
  return state.projectHostSetups.some(
    (setup) => setup.projectId === projectId && setup.hostId === runtimeHostId
  )
    ? target
    : { kind: 'local' }
}

export function getSafeAutoForkSyncKey(repo: Repo): string {
  return `${getRepoExecutionHostId(repo)}:${repo.id}:${repo.path}`
}

export function formatProjectPresenceProfileNames(profileNames: readonly string[]): string {
  const names = [...new Set(profileNames.map((name) => name.trim()).filter(Boolean))]
  if (names.length <= 3) {
    return names.join(', ')
  }
  // Why: the "+N more" overflow suffix is user-visible toast copy and must localize.
  return translate('auto.store.slices.repos.presenceProfileOverflow', '{{names}} +{{count}} more', {
    names: names.slice(0, 3).join(', '),
    count: names.length - 3
  })
}

export async function warnIfProjectKnownInAnotherProfile(
  repo: Repo,
  activeYiruProfileId: string | null
): Promise<void> {
  const findProjectProfiles = shellClient.yiruProfiles?.findProjectProfiles
  // Why: without a loaded active profile ID the scan cannot exclude the
  // current profile and would false-positive on the project just added.
  if (!findProjectProfiles || !activeYiruProfileId) {
    return
  }
  try {
    // Why: Repo.connectionId is dead — nothing sets it since remote hosts
    // were removed (#63) — a repo's profile-presence scan is always local.
    const result = await findProjectProfiles({
      path: repo.path,
      connectionId: null,
      executionHostId: getRepoExecutionHostId(repo),
      excludeProfileId: activeYiruProfileId
    })
    const description = formatProjectPresenceProfileNames(
      result.projects.map((project) => project.profileName)
    )
    if (!description) {
      return
    }
    publishRendererCommandResult({ type: 'repository-cross-profile-duplicate', description })
  } catch (err) {
    // Why: adding a project should not fail because an advisory profile scan failed.
    console.warn('Failed to check project presence in other profiles:', err)
  }
}

export function scheduleSafeAutoForkSync(get: () => AppState, repos: readonly Repo[]): void {
  for (const repo of repos) {
    if (repo.kind === 'folder' || repo.forkSyncMode !== 'safe-auto' || !repo.upstream) {
      continue
    }
    const key = getSafeAutoForkSyncKey(repo)
    const existingAttempt = safeAutoForkSyncAttempts.get(key)
    const now = Date.now()
    if (
      existingAttempt?.promise ||
      (existingAttempt && now - existingAttempt.attemptedAt < SAFE_AUTO_FORK_SYNC_COOLDOWN_MS)
    ) {
      continue
    }
    // Why: Repo.connectionId is dead — nothing sets it since remote hosts
    // were removed (#63) — a repo's safe-auto fork sync is always local.
    const promise = syncRuntimeGitForkDefaultBranch(
      {
        settings: settingsForRepoOwner(get(), repo.id),
        worktreeId: repo.id,
        worktreePath: repo.path,
        connectionId: undefined
      },
      repo.upstream
    )
      .then(() => undefined)
      .catch((error) => {
        // Why: safe-auto is opportunistic. Auth/protection/divergence failures
        // should not create startup noise; the settings row exposes Sync Now
        // for explicit, toast-backed diagnosis.
        console.info('Safe fork auto-sync skipped', error)
      })
      .finally(() => {
        const current = safeAutoForkSyncAttempts.get(key)
        if (current?.promise === promise) {
          safeAutoForkSyncAttempts.set(key, { attemptedAt: now })
        }
      })
    safeAutoForkSyncAttempts.set(key, { attemptedAt: now, promise })
  }
}

export function repoWithFetchedOwner(
  repo: Repo,
  target: ReturnType<typeof getActiveRuntimeTarget>
): Repo {
  if (target.kind === 'environment') {
    return { ...repo, executionHostId: getRuntimeTargetHostId(target) }
  }
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — only executionHostId can still make a repo non-local.
  return repo.executionHostId ? repo : { ...repo, executionHostId: LOCAL_EXECUTION_HOST_ID }
}

export function projectGroupWithFetchedOwner(
  projectGroup: ProjectGroup,
  target: ReturnType<typeof getActiveRuntimeTarget>
): ProjectGroup {
  if (target.kind === 'environment') {
    return { ...projectGroup, executionHostId: getRuntimeTargetHostId(target) }
  }
  if (projectGroup.connectionId) {
    return { ...projectGroup, executionHostId: LOCAL_EXECUTION_HOST_ID }
  }
  return { ...projectGroup, executionHostId: LOCAL_EXECUTION_HOST_ID }
}

export function setupWithFetchedOwner(
  setup: ProjectHostSetup,
  target: ReturnType<typeof getActiveRuntimeTarget>
): ProjectHostSetup {
  const hostId = getRuntimeTargetHostId(target)
  if (target.kind !== 'environment' || setup.hostId !== LOCAL_EXECUTION_HOST_ID) {
    return setup
  }
  return {
    ...setup,
    hostId,
    executionHostId: hostId
  }
}

export async function fetchProjectHostSetupCompatibility(
  target: ReturnType<typeof getActiveRuntimeTarget>,
  repos: readonly Repo[]
): Promise<ProjectHostSetupProjection> {
  try {
    if (target.kind === 'environment') {
      await assertProjectHostSetupRuntimeCapability(target)
    }
    const [projectResponse, setupResponse] = await Promise.all([
      callRuntimeOrpc(target, (client) => client.project.list, undefined, {
        timeoutMs: 15_000
      }),
      callRuntimeOrpc(target, (client) => client.projectHostSetup.list, undefined, {
        timeoutMs: 15_000
      })
    ])
    return {
      projects: projectResponse.projects,
      setups: setupResponse.setups.map((setup) => setupWithFetchedOwner(setup, target))
    }
  } catch {
    // Why: newer clients must still hydrate against older runtimes/preloads
    // that only know `repo.list`; derive the transitional model locally.
    return projectHostSetupProjectionFromRepos(repos)
  }
}

export async function assertProjectHostSetupRuntimeCapability(
  target: ReturnType<typeof getActiveRuntimeTarget>
): Promise<void> {
  if (target.kind !== 'environment') {
    return
  }
  await assertRuntimeEnvironmentCapability(
    target.environmentId,
    PROJECT_HOST_SETUP_RUNTIME_CAPABILITY,
    'The selected runtime host does not support project host setup yet. Update Yiru on the host and try again.',
    15_000
  )
}

export async function assertProjectHostSetupMutationRuntimeCapabilities(
  target: ReturnType<typeof getActiveRuntimeTarget>
): Promise<void> {
  if (target.kind !== 'environment') {
    return
  }
  await assertProjectHostSetupRuntimeCapability(target)
  await assertRuntimeEnvironmentCapability(
    target.environmentId,
    WORKSPACE_RUN_CONTEXT_RUNTIME_CAPABILITY,
    'The selected runtime host does not support explicit workspace run hosts yet. Update Yiru on the host and try again.',
    15_000
  )
}
