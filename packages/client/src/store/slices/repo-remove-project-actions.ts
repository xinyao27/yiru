import { getRepoExecutionHostId } from '@yiru/workbench-model/workspace'
import { getRepoIdFromWorktreeId } from '@yiru/workbench-model/workspace'
import type { StateCreator } from 'zustand'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { closeRuntimeTerminal } from '~renderer/runtime/terminal-inspection'
import { isRuntimeTerminalPtyId } from '~renderer/runtime/terminal-stream'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import type { AppState } from '../types'
import { mergeProjectCompatibilityForHostRepoChange } from './repo-catalog-merge'
import { findRepoForHost, repoMatchesHostIdentity } from './repo-host-identity'
import { settingsForRepoOwner } from './repo-path-status-model'
import { worktreeBelongsToHost, getKnownRepoWorktreeIds } from './repo-update-model'
import type { RepoSlice } from './repos'
import { omitSparsePresetsForRepos } from './sparse-presets'

export function createRepoRemoveProjectActions(
  set: Parameters<StateCreator<AppState, [], [], RepoSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], RepoSlice>>[1]
): Pick<RepoSlice, 'removeProject'> {
  return {
    removeProject: async (projectId, options) => {
      try {
        // Why: pass an explicit hostId when removing a paired runtime's root repo
        // so a duplicate id across hosts resolves to the intended row instead of
        // falling back to the focused host.
        const ownerRepo = findRepoForHost(get().repos, projectId, {
          settings: get().settings,
          hostId: options?.hostId
        })
        if (!ownerRepo) {
          return
        }
        const ownerHostId = getRepoExecutionHostId(ownerRepo)
        // Why: derive the runtime target from the owner's own settings, passing the
        // explicit options.hostId so a duplicate repo id across hosts resolves to the
        // intended row. settingsForRepoOwner clears the focused runtime for local
        // owners and pins runtime owners to their environment, so removal cannot
        // route repo.rm to the wrong host.
        const target = getActiveRuntimeTarget(
          settingsForRepoOwner(get(), projectId, options?.hostId)
        )
        // Why: the same repo id can exist on local and paired-runtime hosts, including
        // a re-paired runtime. Main's repos:remove is repo-id-only and would
        // delete every host's row. Scope the local-side removal to the owning host
        // so a cross-host duplicate id keeps its other rows.
        const idExistsOnOtherHost = get().repos.some(
          (repo) => repo.id === projectId && getRepoExecutionHostId(repo) !== ownerHostId
        )
        await (target.kind === 'local'
          ? idExistsOnOtherHost
            ? workspaceHostClient.repos.removeForHost({ repoId: projectId, hostId: ownerHostId })
            : workspaceHostClient.repos.remove({ repoId: projectId })
          : callRuntimeOrpc(
              target,
              (client) => client.repo.rm,
              { repo: projectId },
              { timeoutMs: 15_000 }
            ))

        get().clearYiruHookTrustForRepo(projectId)
        const repoPath = get().repos.find((repo) =>
          repoMatchesHostIdentity(repo, projectId, ownerHostId)
        )?.path
        get().evictGitHubRepoCaches(projectId, repoPath)

        // Kill PTYs for all worktrees belonging to this repo
        const worktreeIds = getKnownRepoWorktreeIds(get(), projectId, ownerHostId)
        const killedTabIds = new Set<string>()
        if (target.kind === 'environment') {
          await Promise.allSettled(
            worktreeIds.map((worktreeId) =>
              callRuntimeOrpc(
                target,
                (client) => client.terminal.stop,
                { worktree: toRuntimeWorktreeSelector(worktreeId) },
                { timeoutMs: 15_000 }
              )
            )
          )
        }
        for (const wId of worktreeIds) {
          const tabs = get().tabsByWorktree[wId] ?? []
          for (const tab of tabs) {
            killedTabIds.add(tab.id)
            for (const ptyId of get().ptyIdsByTabId[tab.id] ?? []) {
              if (!isRuntimeTerminalPtyId(ptyId)) {
                void closeRuntimeTerminal(ptyId)
              }
            }
          }
        }

        // Why: route project removal through the canonical per-worktree purge so all
        // ~30 worktree-scoped maps are evicted. removeProject previously hand-deleted
        // only a handful (tabs/layouts/ptys), leaking the rest (unified tabs, groups,
        // git status, browser, everActivated, …) per worktree of every removed repo.
        // Runs before the repo-scoped set() below so the purge still sees tabsByWorktree.
        get().purgeWorktreeTerminalState(worktreeIds)

        set((s) => {
          const nextWorktrees = { ...s.worktreesByRepo }
          const remainingWorktrees = (nextWorktrees[projectId] ?? []).filter(
            (worktree) => !worktreeBelongsToHost(worktree, ownerHostId)
          )
          if (remainingWorktrees.length > 0) {
            nextWorktrees[projectId] = remainingWorktrees
          } else {
            delete nextWorktrees[projectId]
          }
          const nextDetectedWorktrees = { ...s.detectedWorktreesByRepo }
          const detected = nextDetectedWorktrees[projectId]
          if (detected) {
            const remainingDetected = detected.worktrees.filter(
              (worktree) => !worktreeBelongsToHost(worktree, ownerHostId)
            )
            if (remainingDetected.length > 0) {
              nextDetectedWorktrees[projectId] = { ...detected, worktrees: remainingDetected }
            } else {
              delete nextDetectedWorktrees[projectId]
            }
          }
          const nextTabs = { ...s.tabsByWorktree }
          const nextLayouts = { ...s.terminalLayoutsByTabId }
          const nextPtyIdsByTabId = { ...s.ptyIdsByTabId }
          const nextRuntimePaneTitlesByTabId = { ...s.runtimePaneTitlesByTabId }
          for (const wId of worktreeIds) {
            delete nextTabs[wId]
          }
          for (const tabId of killedTabIds) {
            delete nextLayouts[tabId]
            delete nextPtyIdsByTabId[tabId]
            delete nextRuntimePaneTitlesByTabId[tabId]
          }
          // Why: editor state is worktree-scoped. Removing a repo must also
          // remove open editor files and per-worktree active-file tracking for
          // all worktrees that belonged to the repo, otherwise orphaned entries
          // would persist in the session save and pollute state.
          const worktreeIdSet = new Set(worktreeIds)
          const nextOpenFiles = s.openFiles.filter((f) => !worktreeIdSet.has(f.worktreeId))
          const nextActiveFileIdByWorktree = { ...s.activeFileIdByWorktree }
          const nextActiveTabTypeByWorktree = { ...s.activeTabTypeByWorktree }
          for (const wId of worktreeIds) {
            delete nextActiveFileIdByWorktree[wId]
            delete nextActiveTabTypeByWorktree[wId]
          }
          const activeFileCleared = s.activeFileId
            ? s.openFiles.some((f) => f.id === s.activeFileId && worktreeIdSet.has(f.worktreeId))
            : false
          const nextRepos = s.repos.filter(
            (r) => !repoMatchesHostIdentity(r, projectId, ownerHostId)
          )
          // Why: when no sibling host still owns this repo id, drop every persisted
          // timestamp for the repo's worktrees, including unhydrated paired-runtime ones
          // absent from worktreeIdSet, which pruneLastVisitedTimestamps would otherwise
          // defer forever as "not yet hydrated" after the repo is gone. When a duplicate
          // id remains on another host, stay host-scoped via worktreeIdSet.
          const repoIdFullyRemoved = !nextRepos.some((r) => r.id === projectId)
          let nextLastVisitedAtByWorktreeId = s.lastVisitedAtByWorktreeId
          for (const id of Object.keys(s.lastVisitedAtByWorktreeId)) {
            if (
              worktreeIdSet.has(id) ||
              (repoIdFullyRemoved && getRepoIdFromWorktreeId(id) === projectId)
            ) {
              if (nextLastVisitedAtByWorktreeId === s.lastVisitedAtByWorktreeId) {
                nextLastVisitedAtByWorktreeId = { ...s.lastVisitedAtByWorktreeId }
              }
              delete nextLastVisitedAtByWorktreeId[id]
            }
          }
          const survivingRepoIds = new Set(nextRepos.map((r) => r.id))
          const removedRepoIds = s.repos.filter((r) => !survivingRepoIds.has(r.id)).map((r) => r.id)
          return {
            repos: nextRepos,
            // Why: drop the removed repos' sparse-preset maps so they don't outlive
            // the repo for the renderer's whole session.
            ...omitSparsePresetsForRepos(s, removedRepoIds),
            ...mergeProjectCompatibilityForHostRepoChange({
              previous: { projects: s.projects, projectHostSetups: s.projectHostSetups },
              nextRepos,
              hostId: ownerHostId
            }),
            activeRepoId: s.activeRepoId === projectId ? null : s.activeRepoId,
            filterRepoIds: s.filterRepoIds.filter((id) => id !== projectId),
            worktreesByRepo: nextWorktrees,
            detectedWorktreesByRepo: nextDetectedWorktrees,
            tabsByWorktree: nextTabs,
            ptyIdsByTabId: nextPtyIdsByTabId,
            runtimePaneTitlesByTabId: nextRuntimePaneTitlesByTabId,
            terminalLayoutsByTabId: nextLayouts,
            activeTabId: s.activeTabId && killedTabIds.has(s.activeTabId) ? null : s.activeTabId,
            openFiles: nextOpenFiles,
            activeFileIdByWorktree: nextActiveFileIdByWorktree,
            activeTabTypeByWorktree: nextActiveTabTypeByWorktree,
            activeFileId: activeFileCleared ? null : s.activeFileId,
            activeTabType: activeFileCleared ? 'terminal' : s.activeTabType,
            lastVisitedAtByWorktreeId: nextLastVisitedAtByWorktreeId,
            folderWorkspacePathStatuses: {},
            sortEpoch: s.sortEpoch + 1,
            // Why: removing the last repo while in settings leaves activeView as
            // 'settings', which renders an empty settings pane instead of Landing.
            // Also clear activeWorktreeId so App renders Landing (it checks
            // !activeWorktreeId). Without this, the terminal surface shows instead.
            ...(nextRepos.length === 0
              ? {
                  activeView: 'terminal' as const,
                  activeWorktreeId: null,
                  activeWorkspaceKey: null,
                  activeRepoId: null
                }
              : {})
          }
        })
      } catch (err) {
        console.error('Failed to remove repo:', err)
      }
    }
  }
}
