import type { GitRuntimeOptions } from '~main/git/runtime-options'
import type {
  CommitMessageAgentEnvironmentResolvers,
  CommitMessageAgentRuntimeTarget
} from '~main/text-generation/commit-message-agent-environment'
import type { CommitMessageGenerationTarget } from '~main/text-generation/commit-message-text-generation'
import {
  mergeLegacyCommitMessageAiIntoSourceControlAi,
  type ResolvedSourceControlAiGenerationParams
} from '~shared/source-control/ai'
import type { SourceControlAiOperation } from '~shared/source-control/ai-types'
import type { GitWorktreeInfo, GlobalSettings, Repo, Worktree } from '~shared/types'

import { normalizeRuntimeRelativePath } from '../relative-paths'

export type ResolvedRuntimeGitWorktree = Worktree & { git: GitWorktreeInfo }

export type RuntimeCommitMessageSettingsOverride = Partial<
  Pick<
    GlobalSettings,
    'commitMessageAi' | 'sourceControlAi' | 'agentCmdOverrides' | 'enableGitHubAttribution'
  >
> & {
  commitMessageDiscoveryHostKey?: string
  sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
}

export type RuntimeGitMutationAdmission = {
  signal?: AbortSignal
  beforeSideEffect?: () => void | Promise<void>
}

export type RuntimeGitTarget = {
  worktree: ResolvedRuntimeGitWorktree
  repo?: Repo
  localGitOptions?: GitRuntimeOptions
}

export type RuntimeGitCommandHost = {
  resolveRuntimeGitTarget(selector: string): Promise<RuntimeGitTarget>
  getRuntimeSettings(): GlobalSettings
  getCommitMessageAgentEnvironment?(): CommitMessageAgentEnvironmentResolvers | undefined
}

export class RuntimeGitCommandBase {
  protected readonly host: RuntimeGitCommandHost

  constructor(host: RuntimeGitCommandHost) {
    this.host = host
  }
}

export async function admitRuntimeGitMutation(
  admission?: RuntimeGitMutationAdmission
): Promise<void> {
  admission?.signal?.throwIfAborted()
  await admission?.beforeSideEffect?.()
  admission?.signal?.throwIfAborted()
}

export function getRuntimeGitGenerationSettings(
  settings: GlobalSettings,
  settingsOverride: RuntimeCommitMessageSettingsOverride | undefined,
  operation: SourceControlAiOperation
): GlobalSettings {
  const mergedSettings = {
    ...settings,
    ...settingsOverride
  }
  if (
    settingsOverride?.commitMessageAi !== undefined &&
    settingsOverride.sourceControlAi === undefined
  ) {
    mergedSettings.sourceControlAi = mergeLegacyCommitMessageAiIntoSourceControlAi(
      settings.sourceControlAi,
      settingsOverride.commitMessageAi,
      { pullRequestInstructionsFromLegacy: operation === 'pullRequest' }
    )
  }
  return mergedSettings
}

export function normalizeRuntimeGitRelativePath(filePath: string): string {
  const relativePath = normalizeRuntimeRelativePath(filePath)
  if (relativePath === '') {
    // Why: git mutation APIs treat an empty pathspec as the worktree root;
    // runtime RPC must never let malformed paths discard whole worktrees.
    throw new Error('invalid_relative_path')
  }
  return relativePath
}

export function generationRepoForTarget(
  target: RuntimeGitTarget,
  repoId: string | undefined
): Repo | null {
  // Why: repoId is renderer-supplied advisory input. The resolved worktree
  // proves ownership before repo-specific AI settings may be applied.
  return repoId && target.repo?.id === repoId ? target.repo : null
}

export function localGitOptionsForTarget(target: RuntimeGitTarget): GitRuntimeOptions {
  return target.localGitOptions ?? {}
}

export function localAgentRuntimeTargetForTarget(
  target: RuntimeGitTarget
): CommitMessageAgentRuntimeTarget {
  const wslDistro = localGitOptionsForTarget(target).wslDistro
  return wslDistro ? { runtime: 'wsl', wslDistro } : { runtime: 'host' }
}

export function localTextGenerationTargetForTarget(
  target: RuntimeGitTarget,
  env?: NodeJS.ProcessEnv
): Extract<CommitMessageGenerationTarget, { kind: 'local' }> {
  const wslDistro = localGitOptionsForTarget(target).wslDistro
  return {
    kind: 'local',
    cwd: target.worktree.path,
    ...(wslDistro ? { wslDistro } : {}),
    ...(env ? { env } : {})
  }
}
