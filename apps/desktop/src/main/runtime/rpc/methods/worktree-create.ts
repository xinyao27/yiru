import type { z } from 'zod'
import { tuiAgentToAgentKind } from '~shared/agent/kind'
import type { WORKTREE_CREATE_CONTRACT } from '~shared/runtime-method-contracts/workspace-contracts'
import type { WorktreeStartupLaunch } from '~shared/types'

import type { RpcContext } from '../core'

export async function handleWorktreeCreate(
  params: z.infer<(typeof WORKTREE_CREATE_CONTRACT)['params']>,
  { runtime }: RpcContext
) {
  // Why: `telemetrySource` is only ever populated by the desktop composer (CLI
  // and mobile never set it for a worktree create), and the composer derives
  // its whole `agent_started` payload from data already on this contract:
  // `launch_source` is `'onboarding'` iff `telemetrySource` is, else
  // `'new_workspace_composer'` (mirrors `composerTelemetry` in
  // `use-composer-state.ts`); `request_kind` is always `'new'` for a create;
  // `agent_kind` comes straight from the agent this same request already
  // carries via `createdWithAgent`. Reconstructing it here means a raw-command
  // (non-agent-preset) create routed to a non-local (SSH/relay) target emits
  // the same telemetry the composer would have sent locally, without
  // duplicating `AgentKind`/`LaunchSource`/`RequestKind` (54 values total)
  // into the contract package.
  const reconstructedStartupTelemetry: WorktreeStartupLaunch['telemetry'] =
    params.telemetrySource && params.createdWithAgent
      ? {
          agent_kind: tuiAgentToAgentKind(params.createdWithAgent),
          launch_source:
            params.telemetrySource === 'onboarding' ? 'onboarding' : 'new_workspace_composer',
          request_kind: 'new'
        }
      : undefined
  const result = await runtime.createManagedWorktree({
    repoSelector: params.repo,
    name: params.name ?? '',
    baseBranch: params.baseBranch,
    compareBaseRef: params.compareBaseRef,
    branchNameOverride: params.branchNameOverride,
    linkedPR: params.linkedPR,
    linkedGitLabMR: params.linkedGitLabMR,
    linkedBitbucketPR: params.linkedBitbucketPR,
    linkedAzureDevOpsPR: params.linkedAzureDevOpsPR,
    linkedGiteaPR: params.linkedGiteaPR,
    comment: params.comment,
    displayName: params.displayName,
    telemetrySource: params.telemetrySource,
    workspaceStatus: params.workspaceStatus,
    manualOrder: params.manualOrder,
    sparseCheckout: params.sparseCheckout,
    pushTarget: params.pushTarget,
    runHooks: params.runHooks === true,
    activate: params.activate === true,
    setupDecision: params.setupDecision,
    createdWithAgent: params.createdWithAgent ?? params.startupAgent,
    pendingFirstAgentMessageRename: params.pendingFirstAgentMessageRename === true,
    // Why: an unknown-capability Mobile client sends both launch forms.
    // This host owns launch policy, so structured agent intent wins.
    //
    // `launchToken` is confirmed dead for this call — the composer never sets
    // it before create, only afterward as a renderer-only fallback-spawn
    // correlation id — so it does not need a contract field.
    startup:
      !params.startupAgent && params.startupCommand
        ? {
            command: params.startupCommand,
            ...(params.startupEnv ? { env: params.startupEnv } : {}),
            ...(params.startupLaunchConfig ? { launchConfig: params.startupLaunchConfig } : {}),
            ...(params.startupCommandDelivery
              ? { startupCommandDelivery: params.startupCommandDelivery }
              : {}),
            ...(reconstructedStartupTelemetry ? { telemetry: reconstructedStartupTelemetry } : {})
          }
        : undefined,
    ...(params.startupAgent ? { startupAgent: params.startupAgent } : {}),
    ...(params.startupPrompt !== undefined ? { startupPrompt: params.startupPrompt } : {}),
    startupDraft: params.startupDraft,
    lineage: {
      parentWorkspace: params.parentWorkspace,
      envParentWorkspace: params.envParentWorkspace,
      parentWorktree: params.parentWorktree,
      ...(params.cwdParentWorktree ? { cwdParentWorktree: params.cwdParentWorktree } : {}),
      noParent: params.noParent === true,
      callerTerminalHandle: params.callerTerminalHandle,
      orchestrationContext: params.orchestrationContext
    }
  })
  // Why: agent callers need a stable dispatch target without traversing
  // terminal-list layout duplicates after creating the worktree.
  return params.startupAgent && result.startupTerminal?.handle
    ? { ...result, agentTerminalHandle: result.startupTerminal.handle }
    : result
}
