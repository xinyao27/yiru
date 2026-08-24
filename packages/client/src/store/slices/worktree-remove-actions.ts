import type { StateCreator } from 'zustand'
import { ensureHooksConfirmed } from '~renderer/components/sidebar/yiru-hook-confirmation'
import { clearSessionCommitDraftForWorktree } from '~renderer/components/workspace-panel/source-control/commit-draft-session'
import { forgetHugeRepoWarningDismissalsForWorktrees } from '~renderer/components/workspace-panel/source-control/huge-repo-warning-dismissals'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { disposeRemovedWorktreeParkedTerminalWatchers } from '~renderer/runtime/terminal-parked-watcher-registry'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'
import {
  classifyWorktreeForceDeleteReason,
  getLockedWorktreeRemovalReason,
  isLockedWorktreeRemovalError
} from '~shared/workspace/worktree-removal'

import type { AppState } from '../types'
import { resolveWorktreeRemovalHost } from './worktree-lineage-model'
import { buildWorktreePurgeState } from './worktree-purge-state'
import { WORKTREE_REMOVAL_AMBIGUOUS_ERROR } from './worktree-refresh-model'
import { pruneHostedReviewLinkMutationGenerations } from './worktree-review-state'
import {
  settingsForExecutionHostOwner,
  settingsForWorktreeOwner
} from './worktree-runtime-list-model'
import { getRepoIdFromWorktreeId, type WorktreeSlice } from './worktree-state'

export function createWorktreeRemoveActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<WorktreeSlice, 'removeWorktree'> {
  return {
    removeWorktree: async (worktreeId, force, options) => {
      const removalOwner = resolveWorktreeRemovalHost(get(), worktreeId)
      if (removalOwner.ambiguous) {
        return { ok: false, error: WORKTREE_REMOVAL_AMBIGUOUS_ERROR }
      }
      const hostId = removalOwner.hostId ?? undefined
      set((s) => ({
        deleteStateByWorktreeId: {
          ...s.deleteStateByWorktreeId,
          [worktreeId]: {
            isDeleting: true,
            phase: 'deleting',
            error: null,
            canForceDelete: false,
            forceDeleteReason: null
          }
        }
      }))

      try {
        const skipArchive =
          (await ensureHooksConfirmed(
            get(),
            getRepoIdFromWorktreeId(worktreeId),
            'archive',
            hostId
          )) === 'skip'

        const worktreeBeforeRemoval = get()
          .allWorktrees()
          .find((entry) => entry.id === worktreeId)
        const terminalPtyIdsBeforeRemoval = (get().tabsByWorktree[worktreeId] ?? []).flatMap(
          (tab) => get().ptyIdsByTabId[tab.id] ?? []
        )
        const currentOwner = resolveWorktreeRemovalHost(get(), worktreeId)
        if (
          currentOwner.ambiguous ||
          (hostId && currentOwner.hostId && currentOwner.hostId !== hostId)
        ) {
          throw new Error(WORKTREE_REMOVAL_AMBIGUOUS_ERROR)
        }
        const target = getActiveRuntimeTarget(
          hostId
            ? settingsForExecutionHostOwner(get().settings, hostId)
            : settingsForWorktreeOwner(get(), worktreeId)
        )
        const removalResult = await (target.kind === 'local'
          ? workspaceHostClient.worktrees.remove({ worktreeId, hostId, force, skipArchive })
          : callRuntimeOrpc(
              target,
              (client) => client.worktree.rm,
              {
                worktree: toRuntimeWorktreeSelector(worktreeId),
                force,
                runHooks: !skipArchive
              },
              { timeoutMs: 60_000 }
            ))

        // Why: invalidate stale probes as soon as deletion is authoritative, so
        // an old toast cannot mutate a same-path replacement during UI teardown.
        forgetHugeRepoWarningDismissalsForWorktrees([worktreeId])

        // Why: backend delete paths now preflight and kill PTYs only after the
        // worktree is cleanly removable. Renderer state follows the successful
        // backend result so blocked dirty deletes keep their terminals intact.
        //
        // Why browsers first: `shutdownWorktreeTerminals` used to own the
        // `browserTabsByWorktree[worktreeId]` delete as a side effect, which would
        // race `shutdownWorktreeBrowsers`' read of the same map. After the §1.3
        // split, terminals no longer touches browser state, but we still call
        // browsers first so destroyPersistentWebview sees the workspaces in place
        // and the Chromium guests are unregistered before any other teardown work
        // can intercept them.
        await get().shutdownWorktreeBrowsers(worktreeId)
        await get().shutdownWorktreeTerminals(worktreeId)
        disposeRemovedWorktreeParkedTerminalWatchers(worktreeId, terminalPtyIdsBeforeRemoval)
        set((state) => {
          const worktreesByRepo = Object.fromEntries(
            Object.entries(state.worktreesByRepo).map(([repoId, worktrees]) => [
              repoId,
              worktrees.filter((worktree) => worktree.id !== worktreeId)
            ])
          )
          return {
            ...buildWorktreePurgeState(state, [worktreeId]),
            worktreesByRepo
          }
        })
        get().removeWorkspaceSpaceWorktrees?.([worktreeId])
        // Why: PR/commit-message generation records are keyed by worktree and were
        // never evicted on removal — they leaked one record (title/body text) per
        // worktree for the session. Prune to the surviving worktree set, reusing
        // the generation slices' tested prune actions.
        const liveWorktreeKeys = new Set(
          get()
            .allWorktrees()
            .map((w) => w.id)
        )
        // Optional-chained like removeWorkspaceSpaceWorktrees above: minimal store
        // assemblies (some unit tests) omit the generation slices.
        get().prunePullRequestGenerationRecords?.(liveWorktreeKeys)
        get().pruneCommitMessageGenerationRecords?.(liveWorktreeKeys)
        // Why: Source Control may be unmounted during deletion, so its local
        // prune effect cannot be the only stale-draft cleanup path.
        clearSessionCommitDraftForWorktree(worktreeId)
        const preservedBranch = removalResult?.preservedBranch
        if (preservedBranch && removalResult && options?.suppressPreservedBranchToast !== true) {
          publishRendererCommandResult({
            type: 'worktree-preserved-branch',
            worktreeId,
            result: removalResult,
            worktree: worktreeBeforeRemoval
          })
        }
        pruneHostedReviewLinkMutationGenerations([worktreeId])
        return preservedBranch ? { ok: true as const, preservedBranch } : { ok: true as const }
      } catch (err) {
        // Why: git refusing a non-force delete for dirty/untracked files is a
        // handled user decision point surfaced by the delete toast, not an app error.
        console.warn('Failed to remove worktree:', err)
        const error = err instanceof Error ? err.message : String(err)
        const forceDeleteReason = classifyWorktreeForceDeleteReason(error, force)
        const locked = isLockedWorktreeRemovalError(error)
        set((s) => ({
          deleteStateByWorktreeId: {
            ...s.deleteStateByWorktreeId,
            [worktreeId]: {
              isDeleting: false,
              error,
              canForceDelete: forceDeleteReason !== null,
              forceDeleteReason,
              ...(locked ? { lockReason: getLockedWorktreeRemovalReason(error) } : {})
            }
          }
        }))
        return { ok: false as const, error }
      }
    }
  }
}
