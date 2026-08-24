import type {
  RuntimeClientEventSubscriptionEvent,
  RuntimeWorktreeStateSubscriptionEvent
} from '@yiru/runtime-protocol/contract'

import { onLocalHostProgressEvent } from './host-progress-stream'
import { callRuntimeOrpc, createLocalRuntimeOrpcClient } from './orpc-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'
import type { WorktreeWorkspaceApi } from './workspace-host-api'
import { toRuntimeWorktreeSelector } from './worktree-selector'

const LOCAL_TARGET = { kind: 'local' } as const

const localClientEvents = createRuntimeStreamFanOut({
  resolveClient: async () => (await createLocalRuntimeOrpcClient()).client,
  open: (client, signal) => client.runtime.clientEvents.subscribe(undefined, { signal })
})
const localStateEvents = createRuntimeStreamFanOut({
  resolveClient: async () => (await createLocalRuntimeOrpcClient()).client,
  open: (client, signal) => client.worktree.stateEvents.subscribe(undefined, { signal })
})

const localWorktreeClient: WorktreeWorkspaceApi = {
  list: async ({ repoId }) =>
    (await callRuntimeOrpc(LOCAL_TARGET, (client) => client.worktree.list, { repo: repoId }))
      .worktrees,
  listDetected: ({ repoId }) =>
    callRuntimeOrpc(LOCAL_TARGET, (client) => client.worktree.detectedList, { repo: repoId }),
  create: (args) =>
    callRuntimeOrpc(LOCAL_TARGET, (client) => client.worktree.create, {
      repo: args.repoId,
      name: args.name,
      baseBranch: args.baseBranch,
      compareBaseRef: args.compareBaseRef,
      branchNameOverride: args.branchNameOverride,
      linkedPR: args.linkedPR,
      linkedGitLabMR: args.linkedGitLabMR,
      linkedBitbucketPR: args.linkedBitbucketPR,
      linkedAzureDevOpsPR: args.linkedAzureDevOpsPR,
      linkedGiteaPR: args.linkedGiteaPR,
      displayName: args.displayName,
      sparseCheckout: args.sparseCheckout,
      pushTarget: args.pushTarget,
      setupDecision: args.setupDecision,
      createdWithAgent: args.createdWithAgent,
      pendingFirstAgentMessageRename: args.pendingFirstAgentMessageRename,
      ...(args.startup
        ? {
            startupCommand: args.startup.command,
            ...(args.startup.env ? { startupEnv: args.startup.env } : {}),
            ...(args.startup.launchConfig
              ? { startupLaunchConfig: args.startup.launchConfig }
              : {}),
            ...(args.startup.startupCommandDelivery
              ? { startupCommandDelivery: args.startup.startupCommandDelivery }
              : {}),
            activate: true
          }
        : {}),
      parentWorkspace: args.parentWorkspace,
      workspaceStatus: args.workspaceStatus,
      manualOrder: args.manualOrder
    }),
  onCreateProgress: (callback) =>
    onLocalHostProgressEvent('worktreeCreateProgress', ({ creationId, phase }) =>
      callback({ creationId, phase })
    ),
  prefetchCreateBase: async ({ repoId, baseBranch }) => {
    await callRuntimeOrpc(
      LOCAL_TARGET,
      (client) => client.worktree.prefetchCreateBase,
      { repo: repoId, baseBranch },
      { suppressFeatureInteraction: true }
    )
  },
  resolvePrBase: ({ repoId, ...input }) =>
    callRuntimeOrpc(LOCAL_TARGET, (client) => client.worktree.resolvePrBase, {
      repo: repoId,
      ...input
    }),
  resolveMrBase: ({ repoId, ...input }) =>
    callRuntimeOrpc(LOCAL_TARGET, (client) => client.worktree.resolveMrBase, {
      repo: repoId,
      ...input
    }),
  remove: ({ worktreeId, force, skipArchive }) =>
    callRuntimeOrpc(LOCAL_TARGET, (client) => client.worktree.rm, {
      worktree: toRuntimeWorktreeSelector(worktreeId),
      force,
      runHooks: skipArchive !== true
    }),
  forceDeletePreservedBranch: ({ worktreeId, branchName, expectedHead }) =>
    callRuntimeOrpc(LOCAL_TARGET, (client) => client.worktree.forceDeleteBranch, {
      worktree: toRuntimeWorktreeSelector(worktreeId),
      branchName,
      expectedHead
    }),
  updateMeta: async ({ worktreeId, updates }) => {
    const rpcUpdates =
      Object.prototype.hasOwnProperty.call(updates, 'pushTarget') &&
      updates.pushTarget === undefined
        ? { ...updates, pushTarget: null }
        : updates
    return (
      await callRuntimeOrpc(LOCAL_TARGET, (client) => client.worktree.set, {
        worktree: toRuntimeWorktreeSelector(worktreeId),
        ...rpcUpdates
      })
    ).worktree
  },
  listLineage: () =>
    callRuntimeOrpc(LOCAL_TARGET, (client) => client.worktree.lineageList, undefined),
  persistSortOrder: async ({ orderedIds }) => {
    await callRuntimeOrpc(LOCAL_TARGET, (client) => client.worktree.persistSortOrder, {
      orderedIds
    })
  },
  onChanged: (callback) =>
    localClientEvents.subscribe((event: RuntimeClientEventSubscriptionEvent) => {
      if (event.type === 'worktreesChanged') {
        callback({ repoId: event.repoId, ...(event.renamed ? { renamed: event.renamed } : {}) })
      }
    }),
  onGitStatusMetadataChanged: (callback) =>
    localClientEvents.subscribe((event: RuntimeClientEventSubscriptionEvent) => {
      if (event.type === 'worktreesChanged') {
        callback({ repoId: event.repoId })
      }
    }),
  onHeadIdentitiesChanged: (callback) =>
    localClientEvents.subscribe((event: RuntimeClientEventSubscriptionEvent) => {
      if (event.type === 'worktreeHeadIdentitiesChanged') {
        callback({ repoId: event.repoId, identities: event.identities })
      }
    }),
  onBaseStatus: (callback) =>
    localStateEvents.subscribe((event: RuntimeWorktreeStateSubscriptionEvent) => {
      if (event.type === 'baseStatus') {
        const { type: _type, ...payload } = event
        callback(payload)
      }
    }),
  onRemoteBranchConflict: (callback) =>
    localStateEvents.subscribe((event: RuntimeWorktreeStateSubscriptionEvent) => {
      if (event.type === 'remoteBranchConflict') {
        const { type: _type, ...payload } = event
        callback(payload)
      }
    })
}

export const worktreeHostClient: WorktreeWorkspaceApi = localWorktreeClient
