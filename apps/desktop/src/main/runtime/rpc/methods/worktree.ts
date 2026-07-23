import {
  WORKTREE_CREATE_CONTRACT,
  WORKTREE_LIST_CONTRACT,
  WORKTREE_REMOVE_CONTRACT,
  WORKTREE_SET_CONTRACT
} from '../../../../shared/runtime-method-contracts/workspace-contracts'
import {
  WorktreeDetectedListParams,
  WorktreeActivate,
  WorktreeForceDeleteBranch,
  WorktreePrefetchCreateBase,
  WorktreePsParams,
  WorktreeResolveMrBase,
  WorktreeResolvePrBase,
  WorktreeSelector,
  WorktreeSortOrder
} from '../../../../shared/runtime-method-contracts/worktree-method-params'
import {
  finishAutomationWorkspaceProvenanceRequest,
  releaseAutomationWorkspaceProvenanceRequest,
  resolveAutomationWorkspaceProvenance
} from '../../../automations/workspace-provenance'
import { defineMethod, type RpcMethod } from '../core'

export const WORKTREE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'worktree.ps',
    mobile: true,
    params: WorktreePsParams,
    handler: async (params, { runtime }) => runtime.getWorktreePs(params.limit)
  }),
  defineMethod({
    contract: WORKTREE_LIST_CONTRACT,
    handler: async (params, { runtime }) => runtime.listManagedWorktrees(params.repo, params.limit)
  }),
  defineMethod({
    name: 'worktree.detectedList',
    params: WorktreeDetectedListParams,
    handler: async (params, { runtime }) => runtime.listDetectedManagedWorktrees(params.repo)
  }),
  defineMethod({
    name: 'worktree.lineageList',
    params: null,
    handler: async (_params, { runtime }) => ({
      lineage: await runtime.listWorktreeLineage(),
      workspaceLineage: await runtime.listWorkspaceLineage()
    })
  }),
  defineMethod({
    name: 'worktree.show',
    mobile: true,
    params: WorktreeSelector,
    handler: async (params, { runtime }) => ({
      worktree: await runtime.showManagedWorktree(params.worktree)
    })
  }),
  defineMethod({
    name: 'worktree.sleep',
    mobile: true,
    params: WorktreeSelector,
    handler: async (params, { runtime }) => runtime.sleepManagedWorktree(params.worktree)
  }),
  defineMethod({
    name: 'worktree.activate',
    mobile: true,
    params: WorktreeActivate,
    handler: async (params, { runtime, clientKind }) =>
      // Why: clientKind ('mobile'|'runtime') scopes the host-renderer slept-agent
      // wake to phones so web/desktop activation behavior is unchanged.
      runtime.activateManagedWorktree(params.worktree, {
        notifyClients: params.notifyClients !== false,
        clientKind
      })
  }),
  defineMethod({
    contract: WORKTREE_CREATE_CONTRACT,
    handler: async (params, { runtime }) => {
      const repo = await runtime.showRepo(params.repo)
      const automationProvenance = resolveAutomationWorkspaceProvenance({
        authority: runtime,
        repoSelector: params.repo,
        repo,
        request: params.automationProvenanceRequest
      })
      // Why: provenance tokens are reserved before creation so retries can recover,
      // but failed create attempts must release the reservation for a safe retry.
      try {
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
          automationProvenance,
          startup: params.startupCommand
            ? {
                command: params.startupCommand,
                ...(params.startupEnv ? { env: params.startupEnv } : {}),
                ...(params.startupLaunchConfig ? { launchConfig: params.startupLaunchConfig } : {}),
                ...(params.startupCommandDelivery
                  ? { startupCommandDelivery: params.startupCommandDelivery }
                  : {})
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
        finishAutomationWorkspaceProvenanceRequest(params.automationProvenanceRequest)
        // Why: agent callers need a stable dispatch target without traversing
        // terminal-list layout duplicates after creating the worktree.
        return params.startupAgent && result.startupTerminal?.handle
          ? { ...result, agentTerminalHandle: result.startupTerminal.handle }
          : result
      } catch (error) {
        releaseAutomationWorkspaceProvenanceRequest(params.automationProvenanceRequest)
        throw error
      }
    }
  }),
  defineMethod({
    name: 'worktree.prefetchCreateBase',
    mobile: true,
    params: WorktreePrefetchCreateBase,
    handler: async (params, { runtime }) => {
      await runtime.prefetchManagedWorktreeCreateBase({
        repoSelector: params.repo,
        baseBranch: params.baseBranch
      })
      return null
    }
  }),
  defineMethod({
    contract: WORKTREE_SET_CONTRACT,
    handler: async (params, { runtime }) => ({
      worktree: await runtime.updateManagedWorktreeMeta(params.worktree, {
        displayName: params.displayName,
        linkedPR: params.linkedPR,
        linkedGitLabMR: params.linkedGitLabMR,
        linkedBitbucketPR: params.linkedBitbucketPR,
        linkedAzureDevOpsPR: params.linkedAzureDevOpsPR,
        linkedGiteaPR: params.linkedGiteaPR,
        comment: params.comment,
        isArchived: params.isArchived,
        isUnread: params.isUnread,
        isPinned: params.isPinned,
        sortOrder: params.sortOrder,
        manualOrder: params.manualOrder,
        lastActivityAt: params.lastActivityAt,
        createdAt: params.createdAt,
        sparseDirectories: params.sparseDirectories,
        sparseBaseRef: params.sparseBaseRef,
        sparsePresetId: params.sparsePresetId,
        baseRef: params.baseRef,
        workspaceStatus: params.workspaceStatus,
        pushTarget: params.pushTarget,
        diffComments: params.diffComments,
        mobileDiffReview: params.mobileDiffReview,
        lineage:
          params.parentWorktree || params.noParent === true
            ? {
                parentWorktree: params.parentWorktree,
                noParent: params.noParent === true
              }
            : undefined
      } as Parameters<typeof runtime.updateManagedWorktreeMeta>[1])
    })
  }),
  defineMethod({
    name: 'worktree.persistSortOrder',
    params: WorktreeSortOrder,
    handler: async (params, { runtime }) =>
      runtime.persistManagedWorktreeSortOrder(params.orderedIds)
  }),
  defineMethod({
    name: 'worktree.resolvePrBase',
    mobile: true,
    params: WorktreeResolvePrBase,
    handler: async (params, { runtime }) =>
      runtime.resolveManagedPrBase({
        repoSelector: params.repo,
        prNumber: params.prNumber,
        headRefName: params.headRefName,
        baseRefName: params.baseRefName,
        isCrossRepository: params.isCrossRepository
      })
  }),
  defineMethod({
    name: 'worktree.resolveMrBase',
    mobile: true,
    params: WorktreeResolveMrBase,
    handler: async (params, { runtime }) =>
      runtime.resolveManagedMrBase({
        repoSelector: params.repo,
        mrIid: params.mrIid,
        sourceBranch: params.sourceBranch,
        targetBranch: params.targetBranch,
        isCrossRepository: params.isCrossRepository
      })
  }),
  defineMethod({
    contract: WORKTREE_REMOVE_CONTRACT,
    handler: async (params, { runtime }) => {
      const result = await runtime.removeManagedWorktree(
        params.worktree,
        params.force === true,
        params.runHooks === true
      )
      return { removed: true, ...result }
    }
  }),
  defineMethod({
    name: 'worktree.forceDeleteBranch',
    mobile: true,
    params: WorktreeForceDeleteBranch,
    handler: async (params, { runtime }) =>
      runtime.forceDeletePreservedBranch(params.worktree, params.branchName, params.expectedHead)
  })
]
