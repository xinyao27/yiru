import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from '@yiru/runtime-protocol/workbench/commit-message/host-key'
import { resolveSourceControlAiForOperation } from '@yiru/runtime-protocol/workbench/source-control/ai'
import type { SourceControlAiOperation } from '@yiru/runtime-protocol/workbench/source-control/ai-types'
import type { GlobalSettings, Repo } from '@yiru/runtime-protocol/workbench/types'

import type { ResolveCommitMessageSettingsResult } from './generation-types'

export function trimGeneratedCommitMessage(message: string): string {
  return message.replace(/\s+$/, '')
}

export function resolveCommitMessageSettings(
  settings: GlobalSettings,
  discoveryHostKey = LOCAL_COMMIT_MESSAGE_HOST_KEY,
  operation: SourceControlAiOperation = 'commitMessage',
  repo?: Pick<Repo, 'sourceControlAi'> | null
): ResolveCommitMessageSettingsResult {
  const resolved = resolveSourceControlAiForOperation({
    settings,
    repo,
    operation,
    discoveryHostKey
  })
  return resolved.ok ? { ok: true, params: resolved.value.params } : resolved
}

export function resolveTextGenerationParams(
  settings: GlobalSettings,
  discoveryHostKey = LOCAL_COMMIT_MESSAGE_HOST_KEY,
  operation: SourceControlAiOperation = 'commitMessage',
  repo?: Pick<Repo, 'sourceControlAi'> | null
): ResolveCommitMessageSettingsResult {
  return resolveCommitMessageSettings(settings, discoveryHostKey, operation, repo)
}
