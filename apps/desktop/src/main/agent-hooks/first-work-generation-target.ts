import {
  prepareLocalCommitMessageAgentEnv,
  type CommitMessageAgentEnvironmentResolvers
} from '../text-generation/commit-message-agent-environment'
import type { CommitMessageGenerationTarget } from '../text-generation/commit-message-text-generation'

/** Resolve the local environment used for branch-name generation. */
export async function resolveGenerationTarget(
  worktreePath: string,
  agentId: string,
  deps: { getAgentEnvResolvers: () => CommitMessageAgentEnvironmentResolvers | undefined }
): Promise<CommitMessageGenerationTarget | null> {
  const localEnv = await prepareLocalCommitMessageAgentEnv(agentId, deps.getAgentEnvResolvers())
  if (!localEnv.ok) {
    return null
  }
  return { kind: 'local', cwd: worktreePath, ...(localEnv.env ? { env: localEnv.env } : {}) }
}
