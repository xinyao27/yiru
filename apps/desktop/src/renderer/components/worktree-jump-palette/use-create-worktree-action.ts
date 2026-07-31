import type React from 'react'
import { useCallback, useEffect } from 'react'
import { CREATE_WORKSPACE_QUICK_ACTION_ID } from '~renderer/components/cmd-j/quick-actions'
import {
  CREATE_WORKTREE_ITEM_ID,
  type WorktreePaletteRequestGuard
} from '~renderer/components/worktree-jump-palette/worktree-palette-create-action'
import {
  parseGitHubPullRequestNumber,
  parseGitHubPullRequestLink
} from '~renderer/lib/github-links'
import { lookupGitHubWorkItemForSource } from '~renderer/lib/github-work-item-source-lookup'
import {
  getLinkedWorkItemSuggestedName,
  getLinkedWorkItemWorkspaceName
} from '~renderer/lib/new-workspace'
import type { LinkedWorkItemSummary } from '~renderer/lib/new-workspace'
import { activateAndRevealWorktree } from '~renderer/lib/worktree-activation'
import { useAppStore } from '~renderer/store'
import { getRepoMapFromState } from '~renderer/store/selectors'
import { buildProjectSourceContextFromRepo } from '~shared/project-source-context'
import { isGitRepoKind } from '~shared/repo-kind'

import type { PaletteHostOptionsResult } from './use-palette-host-options'
import type { PaletteStoreState } from './use-palette-store-state'

const CREATE_WORKSPACE_QUICK_ACTION_ITEM_ID = `quick-action:${CREATE_WORKSPACE_QUICK_ACTION_ID}`

type CreateWorktreeActionInput = Pick<
  PaletteStoreState,
  'closeModal' | 'openModal' | 'recordFeatureInteraction' | 'allWorktrees'
> &
  Pick<PaletteHostOptionsResult, 'repoMap'> & {
    visible: boolean
    createWorktreeName: string
    commandSelectedItemId: string
    prefetchCreateWorkspaceBaseForComposer: (initialRepoId?: string) => void
    createLookupGuard: WorktreePaletteRequestGuard
    preserveCreateLookupOnCloseRef: React.RefObject<boolean>
    skipRestoreFocusRef: React.RefObject<boolean>
  }

// Why: typing a name, a GitHub PR/MR URL, or a raw issue number into the
// empty-state "Create worktree" row all funnel through the same composer
// hand-off — resolving an existing linked workspace first, then prefetching
// and opening the composer (with a GitHub lookup in between for a bare
// number). Keeping the three cases together avoids duplicating that hand-off.
export function useCreateWorktreeAction(input: CreateWorktreeActionInput) {
  const {
    visible,
    closeModal,
    openModal,
    recordFeatureInteraction,
    allWorktrees,
    repoMap,
    createWorktreeName,
    commandSelectedItemId,
    prefetchCreateWorkspaceBaseForComposer,
    createLookupGuard,
    preserveCreateLookupOnCloseRef,
    skipRestoreFocusRef
  } = input

  useEffect(() => {
    const isCreateWorkspaceHighlighted =
      commandSelectedItemId === CREATE_WORKTREE_ITEM_ID ||
      commandSelectedItemId === CREATE_WORKSPACE_QUICK_ACTION_ITEM_ID
    if (!visible || !isCreateWorkspaceHighlighted) {
      return
    }
    // Why: Cmd+J opens the composer after selection; warming the same default
    // repo here buys time while the user is still on the highlighted row.
    prefetchCreateWorkspaceBaseForComposer()
  }, [commandSelectedItemId, prefetchCreateWorkspaceBaseForComposer, visible])

  const handleCreateWorktree = useCallback(() => {
    skipRestoreFocusRef.current = true
    const trimmed = createWorktreeName.trim()
    const ghLink = parseGitHubPullRequestLink(trimmed)
    const ghNumber = parseGitHubPullRequestNumber(trimmed)

    const openComposer = (data: Record<string, unknown>): void => {
      prefetchCreateWorkspaceBaseForComposer(
        typeof data.initialRepoId === 'string' ? data.initialRepoId : undefined
      )
      closeModal()
      recordFeatureInteraction('cmd-j-create-workspace')
      // Why: defer opening so Radix fully unmounts the palette's dialog before
      // the composer modal mounts, avoiding focus churn between the two.
      queueMicrotask(() =>
        openModal('new-workspace-composer', { ...data, telemetrySource: 'command_palette' })
      )
    }

    // Case 1: user pasted a GitHub pull request URL.
    if (ghLink) {
      const { number } = ghLink
      const state = useAppStore.getState()

      // Why: review numbers are repo-agnostic on persisted workspace metadata.
      const matches = allWorktrees.filter((w) => !w.isArchived && w.linkedPR === number)
      const activeMatch = matches.find((w) => w.repoId === state.activeRepoId) ?? matches[0]
      if (activeMatch) {
        closeModal()
        activateAndRevealWorktree(activeMatch.id)
        recordFeatureInteraction('cmd-j-workspace-open')
        return
      }

      // Why: hand the raw URL to the composer's name field so it runs the same
      // cross-project detection as Cmd+N — surfacing the "Switch project?"
      // dialog when the URL targets a different project. Pre-resolving here
      // against an arbitrary repo silently linked cross-project items to the
      // wrong project and skipped that prompt. Seed the active repo so the
      // field compares the URL against the project the user is currently in.
      const eligibleRepos = state.repos.filter((r) => isGitRepoKind(r))
      const repoForLookup =
        (state.activeRepoId && eligibleRepos.find((r) => r.id === state.activeRepoId)) ||
        eligibleRepos[0]
      openComposer(
        repoForLookup
          ? { prefilledName: trimmed, initialRepoId: repoForLookup.id }
          : { prefilledName: trimmed }
      )
      return
    }

    // Case 2: user typed a raw issue number. Resolve against the active repo.
    if (ghNumber !== null) {
      const state = useAppStore.getState()
      const matches = allWorktrees.filter((w) => !w.isArchived && w.linkedPR === ghNumber)
      const activeMatch = matches.find((w) => w.repoId === state.activeRepoId) ?? matches[0]
      if (activeMatch) {
        closeModal()
        activateAndRevealWorktree(activeMatch.id)
        recordFeatureInteraction('cmd-j-workspace-open')
        return
      }

      const repoForLookup =
        (state.activeRepoId ? (repoMap.get(state.activeRepoId) ?? null) : null) ||
        [...getRepoMapFromState(state).values()].find((repo) => isGitRepoKind(repo))
      if (!repoForLookup || !isGitRepoKind(repoForLookup)) {
        openComposer({ prefilledName: trimmed })
        return
      }

      prefetchCreateWorkspaceBaseForComposer(repoForLookup.id)
      const sourceContext = buildProjectSourceContextFromRepo({
        provider: 'github',
        projectId: repoForLookup.id,
        repo: repoForLookup
      })
      const lookupToken = createLookupGuard.start()
      preserveCreateLookupOnCloseRef.current = true
      recordFeatureInteraction('cmd-j-create-workspace')
      closeModal()
      void lookupGitHubWorkItemForSource({
        repoPath: repoForLookup.path,
        repoId: repoForLookup.id,
        sourceContext,
        number: ghNumber
      })
        .then((item) => {
          if (!createLookupGuard.isCurrent(lookupToken)) {
            return
          }
          const data: Record<string, unknown> = { initialRepoId: repoForLookup.id }
          if (item) {
            const linkedWorkItem: LinkedWorkItemSummary = {
              type: item.type,
              number: item.number,
              title: item.title,
              url: item.url
            }
            data.linkedWorkItem = linkedWorkItem
            data.prefilledName =
              getLinkedWorkItemWorkspaceName(linkedWorkItem)?.seedName ??
              getLinkedWorkItemSuggestedName({ title: item.title })
          } else {
            data.prefilledName = trimmed
          }
          queueMicrotask(() =>
            openModal('new-workspace-composer', { ...data, telemetrySource: 'command_palette' })
          )
        })
        .catch(() => {
          if (!createLookupGuard.isCurrent(lookupToken)) {
            return
          }
          queueMicrotask(() =>
            openModal('new-workspace-composer', {
              initialRepoId: repoForLookup.id,
              prefilledName: trimmed,
              telemetrySource: 'command_palette'
            })
          )
        })
      return
    }

    // Case 3: plain name — open composer prefilled.
    openComposer(trimmed ? { prefilledName: trimmed } : {})
  }, [
    allWorktrees,
    closeModal,
    createLookupGuard,
    createWorktreeName,
    openModal,
    prefetchCreateWorkspaceBaseForComposer,
    preserveCreateLookupOnCloseRef,
    recordFeatureInteraction,
    repoMap,
    skipRestoreFocusRef
  ])

  return { handleCreateWorktree }
}
