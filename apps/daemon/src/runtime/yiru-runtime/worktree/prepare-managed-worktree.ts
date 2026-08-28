import { randomUUID } from 'node:crypto'

import { getProjectHostSetupWorktreeMeta } from '@yiru/runtime-protocol/workbench/project-host-setup-projection'
import type { CreateWorktreeResult } from '@yiru/runtime-protocol/workbench/types'
import { invalidateAuthorizedRootsCache } from '~main/filesystem/auth'
import {
  getDefaultTabsLaunch,
  getEffectiveHooks,
  loadHooks,
  shouldRunSetupForCreate
} from '~main/hooks/config'
import { runHook } from '~main/hooks/execution'
import { createSetupRunnerScript } from '~main/hooks/script-runner'
import { formatWorktreeIncludeCopyWarning } from '~main/worktree/include-copy-budget'
import { resolveWorktreeIncludePaths } from '~main/worktree/include-file'
import {
  getWorktreeCreationLayout,
  mergeWorktree,
  shouldSetDisplayName
} from '~main/worktree/logic'
import { resolveWorktreeSharedDirectories } from '~main/worktree/shared-directories'
import {
  createWorktreeCopiedPaths,
  createWorktreeLinkedPaths,
  createWorktreeSharedPaths
} from '~main/worktree/symlinks'

import type {
  ManagedWorktreeMaterializedContext,
  ManagedWorktreePreparedContext
} from '../model/managed-worktree-create'
import { RuntimeWorktreeMaterializeManagedWorktree } from './materialize-managed-worktree'

export abstract class RuntimeWorktreePrepareManagedWorktree extends RuntimeWorktreeMaterializeManagedWorktree {
  protected async prepareManagedWorktree(
    context: ManagedWorktreeMaterializedContext
  ): Promise<ManagedWorktreePreparedContext> {
    const {
      args,
      baseBranch,
      branchName,
      checkoutExistingBranch,
      configuredPushTarget,
      created,
      effectiveCreatedWithAgent,
      effectiveRequestedName,
      effectiveSanitizedName,
      effectiveStartup,
      lineageResolution,
      localWorktreeGitOptions,
      remoteTrackingBase,
      repo,
      requestedDisplayName,
      settings,
      sparseDirectories,
      worktreePath
    } = context
    args.onProgress?.({ phase: 'copying-files' })
    const store = this.requireStore()
    const worktreeId = `${repo.id}::${created.path}`
    const now = Date.now()
    // Why: PR/MR-created worktrees can start from a head ref/SHA while Source
    // Control must compare against the review target branch.
    const metadataBaseRef = args.compareBaseRef ?? remoteTrackingBase?.ref ?? baseBranch
    const displayNameMeta = requestedDisplayName
      ? { displayName: requestedDisplayName }
      : shouldSetDisplayName(effectiveRequestedName, branchName, effectiveSanitizedName)
        ? { displayName: effectiveRequestedName }
        : {}
    const meta = store.setWorktreeMeta(worktreeId, {
      // Why: worktree IDs are path-derived. Recreating the same path must mint
      // a fresh identity so stale lineage records fail validation.
      instanceId: randomUUID(),
      ...getProjectHostSetupWorktreeMeta(store.getProjectHostSetups?.() ?? [], repo),
      lastActivityAt: now,
      // Why: createdAt gives a new worktree a grace window in Recent sort.
      createdAt: now,
      yiruCreatedAt: now,
      yiruCreationSource: 'runtime',
      yiruCreationWorkspaceLayout: getWorktreeCreationLayout(repo, settings),
      ...displayNameMeta,
      baseRef: metadataBaseRef,
      ...(checkoutExistingBranch ? { preserveBranchOnDelete: true } : {}),
      ...(configuredPushTarget ? { pushTarget: configuredPushTarget } : {}),
      ...(sparseDirectories.length > 0
        ? {
            sparseDirectories,
            sparseBaseRef: metadataBaseRef,
            sparsePresetId: args.sparseCheckout?.presetId
          }
        : {}),
      ...(args.linkedPR !== undefined ? { linkedPR: args.linkedPR } : {}),
      ...(args.linkedGitLabMR !== undefined ? { linkedGitLabMR: args.linkedGitLabMR } : {}),
      ...(args.linkedBitbucketPR !== undefined
        ? { linkedBitbucketPR: args.linkedBitbucketPR }
        : {}),
      ...(args.linkedAzureDevOpsPR !== undefined
        ? { linkedAzureDevOpsPR: args.linkedAzureDevOpsPR }
        : {}),
      ...(args.linkedGiteaPR !== undefined ? { linkedGiteaPR: args.linkedGiteaPR } : {}),
      ...(effectiveCreatedWithAgent ? { createdWithAgent: effectiveCreatedWithAgent } : {}),
      ...(args.pendingFirstAgentMessageRename === true && effectiveCreatedWithAgent
        ? { pendingFirstAgentMessageRename: true }
        : {}),
      ...(args.comment !== undefined ? { comment: args.comment } : {}),
      ...(args.manualOrder !== undefined ? { manualOrder: args.manualOrder } : {}),
      ...(args.workspaceStatus !== undefined ? { workspaceStatus: args.workspaceStatus } : {})
    })
    const worktree = mergeWorktree(repo.id, created, meta)
    const {
      lineage,
      workspaceLineage,
      warnings: lineageWarnings
    } = this.recordCreatedWorktreeLineage(worktree, lineageResolution)

    if (repo.symlinkPaths && repo.symlinkPaths.length > 0) {
      await createWorktreeLinkedPaths(repo.path, created.path, repo.symlinkPaths)
    }
    const sharedDirectories = await resolveWorktreeSharedDirectories(
      repo.path,
      localWorktreeGitOptions
    )
    if (sharedDirectories.length > 0) {
      await createWorktreeSharedPaths(repo.path, created.path, sharedDirectories)
    }
    const includePaths = await resolveWorktreeIncludePaths(repo.path, localWorktreeGitOptions)
    const skippedIncludePaths = await createWorktreeCopiedPaths(
      repo.path,
      created.path,
      includePaths
    )
    args.onProgress?.({
      copiedFileCount: Math.max(0, includePaths.length - skippedIncludePaths.length),
      phase: 'checking-setup'
    })
    let warning = formatWorktreeIncludeCopyWarning(skippedIncludePaths)

    let setup: CreateWorktreeResult['setup']
    const yamlHooks = loadHooks(worktreePath)
    const hooks = getEffectiveHooks(repo, worktreePath)
    const effectiveDecision = args.runHooks ? 'run' : (args.setupDecision ?? 'inherit')
    let defaultTabs: CreateWorktreeResult['defaultTabs']
    try {
      defaultTabs = getDefaultTabsLaunch(yamlHooks, repo, effectiveDecision)
    } catch (error) {
      console.warn(`[hooks] default tab commands skipped for ${worktreePath}:`, error)
      defaultTabs = yamlHooks?.defaultTabs
        ? { tabs: yamlHooks.defaultTabs, runCommands: false }
        : undefined
    }
    const hasSetupHook = Boolean(hooks?.scripts.setup)
    const shouldRunSetup = hasSetupHook && shouldRunSetupForCreate(repo, effectiveDecision)
    if (shouldRunSetup && hooks?.scripts.setup) {
      const shouldUseSetupRunner =
        this.terminalSessions.getAuthoritativeWindowId() !== null || Boolean(effectiveStartup)
      if (shouldUseSetupRunner) {
        try {
          // Why: setup and startup share this runner so startup can await setup.
          setup = createSetupRunnerScript(
            repo,
            worktreePath,
            hooks.scripts.setup,
            this.getLocalGitExecutionOptionArgs(repo)[0]
          )
        } catch (error) {
          // Why: Git creation already succeeded; runner generation is non-fatal.
          console.error(`[hooks] Failed to prepare setup runner for ${worktreePath}:`, error)
        }
      } else {
        args.onProgress?.({
          phase: 'running-setup',
          setupCommand: hooks.scripts.setup,
          setupConfigured: true
        })
        void runHook(
          'setup',
          worktreePath,
          repo,
          worktreePath,
          this.getLocalGitExecutionOptionArgs(repo)[0]
        ).then((result) => {
          if (!result.success) {
            console.error(`[hooks] setup hook failed for ${worktreePath}:`, result.output)
          }
        })
      }
    } else if (hasSetupHook && effectiveDecision !== 'skip') {
      warning = `yiru.yaml setup hook skipped for ${worktreePath}; pass --setup run to run it.`
      console.warn(`[hooks] ${warning}`)
    }
    if (!shouldRunSetup) {
      args.onProgress?.({ phase: 'checking-setup', setupConfigured: hasSetupHook })
    }

    this.invalidateResolvedWorktreeCache()
    // Why: filesystem authorization caches registered roots separately.
    invalidateAuthorizedRootsCache()
    this.notifyWorktreesChanged(repo.id)
    return {
      ...context,
      worktree,
      lineage,
      workspaceLineage,
      lineageWarnings,
      setup,
      defaultTabs,
      effectiveDecision,
      hasSetupHook,
      shouldRunSetup,
      warning
    }
  }
}
