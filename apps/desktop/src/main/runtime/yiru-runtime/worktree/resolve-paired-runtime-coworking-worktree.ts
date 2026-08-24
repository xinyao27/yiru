import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId
} from '@yiru/workbench-model/workspace'
import type { Store } from '~main/persistence'
import {
  filterWorkspacePortProbes,
  killWorkspacePort,
  scanWorkspacePortProbes
} from '~main/ports/workspace-port-ownership'
import { getLocalProjectWorktreeGitOptions } from '~main/project-runtime-git-options'
import { requestShellSleepWorktree } from '~main/runtime/rpc/orpc/shell-services-reverse-link'
import type {
  CoworkingPairedRuntimeResolvedWorktree,
  CoworkingPairedRuntimeWorktreeSelector
} from '~shared/coworking/paired-runtime-host-contract'
import { isFolderRepo } from '~shared/repo-kind'
import type {
  WorkspacePortKillRequest,
  WorkspacePortKillResult,
  WorkspacePortProbe,
  WorkspacePortScanResult
} from '~shared/workspace/ports'

import { findLocalRepoById } from '../model/worktree-storage'
import { RuntimeWorktreeGetSetupHookTrustPayload } from './get-setup-hook-trust-payload'

export abstract class RuntimeWorktreeResolvePairedRuntimeCoworkingWorktree extends RuntimeWorktreeGetSetupHookTrustPayload {
  async resolvePairedRuntimeCoworkingWorktree(
    selector: CoworkingPairedRuntimeWorktreeSelector
  ): Promise<CoworkingPairedRuntimeResolvedWorktree> {
    const store = this.requireStore()
    const worktree = await this.resolveWorktreeSelector(`id:${selector.worktreeId}`)
    const repo = findLocalRepoById(store, worktree.repoId)
    const kind = repo && isFolderRepo(repo) ? 'folder' : 'git'
    if (
      !repo ||
      worktree.id !== selector.worktreeId ||
      worktree.instanceId !== selector.instanceId ||
      kind !== selector.kind
    ) {
      throw new Error('selector_not_found')
    }
    const executionHostId = getRepoExecutionHostId(repo)
    const host = parseExecutionHostId(executionHostId)
    if (!host || host.kind === 'runtime') {
      // Why: an internal actual-host call must terminate here, never become a recursive gateway.
      throw new Error('recursive_runtime_host')
    }
    if (worktree.hostId && worktree.hostId !== executionHostId) {
      throw new Error('worktree_host_mismatch')
    }
    return {
      kind,
      worktreeId: worktree.id,
      instanceId: selector.instanceId,
      projectId: worktree.projectId ?? null,
      repoId: worktree.repoId,
      executionHostId,
      connectionId: null,
      ...(worktree.projectHostSetupId ? { projectHostSetupId: worktree.projectHostSetupId } : {}),
      worktreePath: worktree.path,
      localWslDistro:
        host.kind === 'local'
          ? (getLocalProjectWorktreeGitOptions(store, repo).wslDistro ?? null)
          : null
    }
  }

  getPairedRuntimeCoworkingStore(): Store {
    // Why: only the internal paired-runtime host adapter needs Store-backed path authorization.
    return this.requireStore()
  }

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
    // Why: sleep is renderer-owned (it tears down tab state before killing
    // PTYs), so the runtime asks its attached shell to run the ordered flow and
    // waits for the renderer's teardown promise before acknowledging mobile.
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
    /** Mobile-scoped slept-agent wake outcome. `unsupported-headless` means no
     *  renderer holds the sleeping records (headless `yiru serve`), so nothing
     *  woke — clients must not present the worktree's agents as resumed. */
    sleepingAgentWake: 'requested' | 'unsupported-headless' | 'not-applicable'
  }> {
    this.assertGraphReady()
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    const repo = this.store ? findLocalRepoById(this.store, worktree.repoId) : undefined
    if (!repo) {
      throw new Error('repo_not_found')
    }

    if (opts.notifyClients === false && this.store?.getWorktreeMeta(worktree.id)?.isUnread) {
      // Why: mobile/web session activation intentionally bypasses renderer
      // selection, so the runtime must acknowledge the unread state itself.
      this.store.setWorktreeMeta(worktree.id, { isUnread: false })
      this.notifyWorktreesChanged(repo.id)
    }

    let sleepingAgentWake: 'requested' | 'unsupported-headless' | 'not-applicable' =
      'not-applicable'
    if (opts.notifyClients !== false) {
      // Why: inactive worktree terminal panes are renderer-owned and may not have
      // live PTYs until the desktop activates the worktree and mounts them.
      this.notifyActivateWorktree(repo.id, worktree.id)
    } else {
      // Why: mobile/web selection needs fresh session surfaces without forcing
      // every attached desktop renderer to navigate to the phone's workspace.
      this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktree.id, {
        allowAttachedWindow: true
      })
      await this.refreshMobileSessionPtyRecords()
      this.notifyMobileSessionTabsChanged(worktree.id)
      // Why: a phone open must also wake the worktree's slept agents (experimental
      // agent sleep). Only the host renderer holds the sleeping records + wake
      // authority, so fire-and-forget ask it — mobile-scoped so web/desktop are
      // unaffected. Headless serve has no renderer to wake anything, so report
      // that explicitly instead of letting mobile assume the agents resumed.
      if (opts.clientKind === 'mobile') {
        if (
          this.dispatchShellCommand({
            type: 'resumeSleepingAgents',
            worktreeId: worktree.id
          })
        ) {
          sleepingAgentWake = 'requested'
        } else if (
          // Why: sleeping records are partitioned by execution host; reading
          // only the local partition would miss paired-runtime worktrees and
          // skip the headless warning for them.
          Object.values(
            this.store?.getWorkspaceSession?.(getRepoExecutionHostId(repo))
              .sleepingAgentSessionsByPaneKey ?? {}
          ).some((record) => record.worktreeId === worktree.id)
        ) {
          // Why: headless is only degraded when this worktree actually has a
          // persisted resume record. Ordinary mobile activation must not show
          // an unsupported warning merely because no desktop window is open.
          sleepingAgentWake = 'unsupported-headless'
        }
      }
    }
    return { repoId: repo.id, worktreeId: worktree.id, activated: true, sleepingAgentWake }
  }
}
