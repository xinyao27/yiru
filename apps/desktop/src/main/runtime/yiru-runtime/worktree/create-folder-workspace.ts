import { randomUUID } from 'node:crypto'

import { getProjectHostSetupWorktreeMeta } from '~shared/project-host-setup-projection'
import { isFolderRepo } from '~shared/repo-kind'
import type { CreateWorktreeResult } from '~shared/types'

import type { ManagedWorktreeStartupContext } from '../model/managed-worktree-create'
import {
  getRuntimeFolderWorkspaceInstanceId,
  mergeRuntimeFolderWorkspace
} from '../model/worktree-storage'
import { RuntimeWorktreeWaitForStartupDraftReady } from './wait-for-startup-draft-ready'

export abstract class RuntimeWorktreeCreateFolderWorkspace extends RuntimeWorktreeWaitForStartupDraftReady {
  protected async createFolderWorkspaceFromManagedArgs(
    context: ManagedWorktreeStartupContext
  ): Promise<CreateWorktreeResult | null> {
    const {
      args,
      effectiveCreatedWithAgent,
      effectiveDraftPaste,
      effectiveStartup,
      effectiveStartupFollowup,
      repo,
      settings
    } = context
    if (!isFolderRepo(repo)) {
      return null
    }
    const store = this.requireStore()
    const now = Date.now()
    const instanceId = randomUUID()
    const worktreeId = getRuntimeFolderWorkspaceInstanceId(repo, instanceId)
    const meta = store.setWorktreeMeta(worktreeId, {
      instanceId,
      ...getProjectHostSetupWorktreeMeta(store.getProjectHostSetups?.() ?? [], repo),
      displayName: args.displayName?.trim() || args.name,
      lastActivityAt: now,
      createdAt: now,
      yiruCreatedAt: now,
      yiruCreationSource: 'runtime',
      yiruCreationWorkspaceLayout: {
        path: settings.workspaceDir,
        nestWorkspaces: settings.nestWorkspaces
      },
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
      ...(args.comment !== undefined ? { comment: args.comment } : {}),
      ...(args.manualOrder !== undefined ? { manualOrder: args.manualOrder } : {}),
      ...(args.workspaceStatus !== undefined ? { workspaceStatus: args.workspaceStatus } : {})
    })
    const worktree = mergeRuntimeFolderWorkspace(repo, worktreeId, meta)
    this.invalidateResolvedWorktreeCache()
    this.notifyWorktreesChanged(repo.id)
    const shouldActivate = args.activate === true || args.runHooks === true
    let warning: string | undefined
    let didSpawnStartup = false
    let startupTerminal: CreateWorktreeResult['startupTerminal']
    if (effectiveStartup && this.ptyController?.spawn) {
      try {
        const startupTrustAgent = effectiveDraftPaste?.agent ?? effectiveCreatedWithAgent
        if (startupTrustAgent) {
          this.markLocalWorkspaceTrustedForAgent(startupTrustAgent, worktree.path)
        }
        const terminal = await this.createTerminal(`id:${worktree.id}`, {
          command: effectiveStartup.command,
          env: effectiveStartup.env,
          ...(effectiveStartup.launchConfig ? { launchConfig: effectiveStartup.launchConfig } : {}),
          ...(effectiveCreatedWithAgent ? { launchAgent: effectiveCreatedWithAgent } : {}),
          startupCommandDelivery: effectiveStartup.startupCommandDelivery,
          telemetry: effectiveStartup.telemetry
        })
        if (effectiveDraftPaste) {
          this.pasteStartupDraftWhenReady(terminal.handle, effectiveDraftPaste)
        }
        if (effectiveStartupFollowup) {
          this.sendStartupFollowupWhenReady(terminal.handle, effectiveStartupFollowup)
        }
        didSpawnStartup = true
        startupTerminal = {
          spawned: true,
          handle: terminal.handle,
          ...(terminal.tabId ? { tabId: terminal.tabId } : {}),
          ...(terminal.paneKey ? { paneKey: terminal.paneKey } : {}),
          ...(terminal.ptyId ? { ptyId: terminal.ptyId } : {}),
          surface: 'background'
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        warning = `Failed to create the startup terminal for ${worktree.path}: ${message}`
        console.warn(`[worktree-create] ${warning}`)
      }
    }
    if (shouldActivate) {
      this.notifyActivateWorktree(
        repo.id,
        worktree.id,
        undefined,
        effectiveStartup && !didSpawnStartup ? effectiveStartup : undefined
      )
    } else if (this.ptyController?.spawn && !didSpawnStartup) {
      try {
        await this.createTerminal(`id:${worktree.id}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        warning = warning
          ? `${warning} Also failed to create the initial terminal for ${worktree.path}: ${message}`
          : `Failed to create the initial terminal for ${worktree.path}: ${message}`
        console.warn(`[worktree-create] ${warning}`)
      }
    }
    return {
      worktree: {
        ...worktree,
        parentWorktreeId: null,
        childWorktreeIds: [],
        lineage: null,
        git: {
          path: worktree.path,
          head: worktree.head,
          branch: worktree.branch,
          isBare: worktree.isBare,
          isMainWorktree: worktree.isMainWorktree
        }
      },
      ...(startupTerminal ? { startupTerminal } : {}),
      ...(warning ? { warning } : {})
    }
  }
}
