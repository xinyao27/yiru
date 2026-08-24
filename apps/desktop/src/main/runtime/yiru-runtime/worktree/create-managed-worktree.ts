import { isTuiAgentEnabled } from '~shared/tui-agent/selection'
import type { CreateWorktreeResult } from '~shared/types'

import type {
  ManagedWorktreeCreateArgs,
  ManagedWorktreeStartupContext
} from '../model/managed-worktree-create'
import { RuntimeWorktreeCompleteManagedWorktreeCreate } from './complete-managed-worktree-create'

export abstract class RuntimeWorktreeCreateManagedWorktree extends RuntimeWorktreeCompleteManagedWorktreeCreate {
  async createManagedWorktree(args: ManagedWorktreeCreateArgs): Promise<CreateWorktreeResult> {
    const store = this.requireStore()
    const repo = await this.resolveRepoSelector(args.repoSelector)
    const settings = store.getSettings()
    const requestedAgent = args.startupAgent ?? args.createdWithAgent
    const isRequestedAgentEnabled =
      requestedAgent !== undefined
        ? isTuiAgentEnabled(requestedAgent, settings.disabledTuiAgents)
        : false
    if ((args.startup || args.startupAgent) && requestedAgent && !isRequestedAgentEnabled) {
      throw new Error('Selected agent is disabled. Choose an enabled agent before creating.')
    }
    if (
      args.startup &&
      args.startupDraftPaste &&
      !isTuiAgentEnabled(args.startupDraftPaste.agent, settings.disabledTuiAgents)
    ) {
      throw new Error('Selected agent is disabled. Choose an enabled agent before creating.')
    }
    const agentStartup =
      !args.startup && args.startupAgent
        ? this.buildStartupForAgent(repo, args.startupAgent, args.startupPrompt)
        : null
    const draftStartup =
      !args.startup && !agentStartup && args.startupDraft
        ? await this.buildStartupForDraft(repo, args.startupDraft, requestedAgent)
        : null
    const context: ManagedWorktreeStartupContext = {
      args,
      repo,
      settings,
      effectiveStartup: args.startup ?? agentStartup?.startup ?? draftStartup?.startup,
      effectiveStartupFollowup: agentStartup?.followup,
      effectiveCreatedWithAgent: args.startup
        ? args.createdWithAgent
        : (agentStartup?.agent ??
          draftStartup?.agent ??
          (isRequestedAgentEnabled ? requestedAgent : undefined)),
      effectiveDraftPaste: args.startupDraftPaste ?? draftStartup?.draftPaste
    }
    const folderWorkspace = await this.createFolderWorkspaceFromManagedArgs(context)
    if (folderWorkspace) {
      return folderWorkspace
    }
    const branchContext = await this.resolveWorktreeCreateTarget(context)
    const materializedContext = await this.materializeManagedWorktree(branchContext)
    const preparedContext = await this.prepareManagedWorktree(materializedContext)
    return this.completeManagedWorktreeCreate(preparedContext)
  }
}
