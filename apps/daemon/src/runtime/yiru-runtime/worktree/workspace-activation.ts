import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '@yiru/runtime-protocol/model/workspace'
import type {
  WorkspacePortKillRequest,
  WorkspacePortKillResult,
  WorkspacePortProbe,
  WorkspacePortScanResult
} from '@yiru/runtime-protocol/workbench/workspace/ports'
import {
  filterWorkspacePortProbes,
  killWorkspacePort,
  scanWorkspacePortProbes
} from '~main/ports/workspace-port-ownership'
import { requestShellSleepWorktree } from '~main/runtime/rpc/orpc/shell-services-reverse-link'

import { findLocalRepoById } from '../model/worktree-storage'
import { RuntimeWorktreeGetSetupHookTrustPayload } from './get-setup-hook-trust-payload'

export abstract class RuntimeWorktreeWorkspaceActivation extends RuntimeWorktreeGetSetupHookTrustPayload {
  async scanWorkspacePorts(repoId?: string): Promise<WorkspacePortScanResult> {
    return scanWorkspacePortProbes(await this.getWorkspacePortProbes(repoId))
  }

  async killWorkspacePort(args: WorkspacePortKillRequest): Promise<WorkspacePortKillResult> {
    return killWorkspacePort(await this.getWorkspacePortProbes(args.repoId), args)
  }

  // Why: remote clients may invoke this over RPC, so the runtime derives
  // allowed worktree paths from its own store instead of trusting client paths.
  protected async getWorkspacePortProbes(repoId?: string): Promise<WorkspacePortProbe[]> {
    const reposById = new Map(
      this.requireStore()
        .getRepos()
        .filter((repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID)
        .map((repo) => [repo.id, repo])
    )
    return filterWorkspacePortProbes(
      (await this.listResolvedWorktrees()).map((worktree) => ({
        id: worktree.id,
        repoId: worktree.repoId,
        displayName: worktree.displayName,
        path: worktree.git.path,
        connectionId: reposById.get(worktree.repoId)?.connectionId ?? null
      })),
      repoId
    )
  }

  async sleepManagedWorktree(worktreeSelector: string): Promise<{ worktreeId: string }> {
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    // Why: the attached workbench tears down tab state before killing PTYs, so
    // the runtime asks it to run the ordered flow before acknowledging mobile.
    const accepted = await requestShellSleepWorktree(
      this.shellConnectionId ?? undefined,
      worktree.id
    )
    if (!accepted) {
      throw new Error('shell_unavailable')
    }
    return { worktreeId: worktree.id }
  }

  async activateManagedWorktree(
    worktreeSelector: string,
    opts: { notifyClients?: boolean; clientKind?: 'mobile' | 'runtime' } = {}
  ): Promise<{
    repoId: string
    worktreeId: string
    activated: boolean
    sleepingAgentWake: 'requested' | 'unsupported-headless' | 'not-applicable'
  }> {
    this.assertGraphReady()
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    const repo = this.store ? findLocalRepoById(this.store, worktree.repoId) : undefined
    if (!repo) {
      throw new Error('repo_not_found')
    }

    if (opts.notifyClients === false && this.store?.getWorktreeMeta(worktree.id)?.isUnread) {
      this.store.setWorktreeMeta(worktree.id, { isUnread: false })
      this.notifyWorktreesChanged(repo.id)
    }

    let sleepingAgentWake: 'requested' | 'unsupported-headless' | 'not-applicable' =
      'not-applicable'
    if (opts.notifyClients !== false) {
      this.notifyActivateWorktree(repo.id, worktree.id)
    } else {
      this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktree.id, {
        allowAttachedWindow: true
      })
      await this.refreshMobileSessionPtyRecords()
      this.notifyMobileSessionTabsChanged(worktree.id)
      if (opts.clientKind === 'mobile') {
        if (
          this.dispatchShellCommand({
            type: 'resumeSleepingAgents',
            worktreeId: worktree.id
          })
        ) {
          sleepingAgentWake = 'requested'
        } else if (
          Object.values(
            this.store?.getWorkspaceSession?.(getRepoExecutionHostId(repo))
              .sleepingAgentSessionsByPaneKey ?? {}
          ).some((record) => record.worktreeId === worktree.id)
        ) {
          sleepingAgentWake = 'unsupported-headless'
        }
      }
    }
    return { repoId: repo.id, worktreeId: worktree.id, activated: true, sleepingAgentWake }
  }
}
