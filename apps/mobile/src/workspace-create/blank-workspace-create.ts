import type { TuiAgent } from '@yiru/workbench-model/agent'

import type { RpcClient } from '../transport/rpc-client'
import {
  buildMobileWorkspaceAgentLaunchFields,
  type WorkspaceCreateSetupDecision
} from './workspace-create-params'
import { createWorktreeWithNameRetry, type WorktreeCreateResult } from './worktree-create-retry'

// The blank/named create path, extracted from NewWorktreeModal so the modal keeps
// only the UI-coupled setup-trust flow. Assembles worktree.create params and
// applies the shared name-collision retry.
export async function createBlankWorkspace(args: {
  client: RpcClient
  repoId: string
  baseName: string
  startupCommand: string | undefined
  createdWithAgentId: TuiAgent | undefined
  hostCapabilities: readonly string[] | undefined
  comment: string | undefined
  setupDecision: WorkspaceCreateSetupDecision
}): Promise<WorktreeCreateResult> {
  return createWorktreeWithNameRetry({
    client: args.client,
    baseName: args.baseName,
    buildParams: (name) => {
      const params: Record<string, unknown> = {
        repo: `id:${args.repoId}`,
        setupDecision: args.setupDecision,
        name,
        ...buildMobileWorkspaceAgentLaunchFields({
          agentId: args.createdWithAgentId,
          startupCommand: args.startupCommand,
          hostCapabilities: args.hostCapabilities
        })
      }
      if (args.comment) {
        params.comment = args.comment
      }
      return params
    }
  })
}
