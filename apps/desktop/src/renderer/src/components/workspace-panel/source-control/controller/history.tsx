import { useCallback, useEffect } from 'react'

import type { DiffComment, GitBranchChangeEntry } from '../../../../../../shared/types'
import { getConnectionId } from '../../../../lib/connection-context'
import { detectLanguage } from '../../../../lib/language-detect'
import { joinPath } from '../../../../lib/path'
import { stageRuntimeGitPath } from '../../../../runtime/git-client'
import { getDiffCommentSource } from '../../../editor/diff-comment-compat'
import { useGitHistoryCommitActions } from '../../use-git-history-commit-actions'
import {
  cancelSourceControlEditorRevealFrames,
  requestSourceControlEditorRevealFrame
} from '../editor-reveal'
import { shouldOpenSourceControlRowAsPreview, type SourceControlRowOpenEvent } from '../split-open'
import type { SourceControlBranchCompareController } from './branch-compare'

export function useSourceControlHistory(scope: SourceControlBranchCompareController) {
  const {
    activeRepoSettings,
    activeWorktree,
    activeWorktreeId,
    branchEntries,
    branchSummary,
    entries,
    fetchUpstreamStatus,
    handleOpenDiff,
    isBranchVisible,
    isFolder,
    openBranchDiff,
    openFile,
    pendingCommentEditorRevealFrameIdsRef,
    refreshActiveGitStatusAfterMutation,
    resolveSplitTargetGroupId,
    revealCombinedDiffSection,
    setCollapsedSections,
    setCollapsedTreeDirs,
    setEditorViewMode,
    setMarkdownViewMode,
    setPendingEditorReveal,
    setScrollToDiffCommentId,
    workspacePanelTabId,
    worktreePath
  } = scope
  useEffect(() => {
    // Why: avoid Git subprocesses while the sidebar is hidden; remote operations
    // already refresh upstream status before it becomes visible again.
    if (!activeWorktreeId || !worktreePath || isFolder || !isBranchVisible) {
      return
    }
    const connectionId = getConnectionId(activeWorktreeId) ?? undefined
    void fetchUpstreamStatus(
      activeWorktreeId,
      worktreePath,
      connectionId,
      activeWorktree?.pushTarget,
      { runtimeTargetSettings: activeRepoSettings }
    )
  }, [
    activeRepoSettings,
    activeWorktree?.pushTarget,
    activeWorktreeId,
    fetchUpstreamStatus,
    isBranchVisible,
    isFolder,
    worktreePath
  ])
  const toggleSection = useCallback(
    (section: string) => {
      setCollapsedSections((prev) => {
        const next = new Set(prev)
        if (next.has(section)) {
          next.delete(section)
        } else {
          next.add(section)
        }
        return next
      })
    },
    [setCollapsedSections]
  )
  const toggleTreeDir = useCallback(
    (key: string) => {
      setCollapsedTreeDirs((prev) => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
    },
    [setCollapsedTreeDirs]
  )
  const openCommittedDiff = useCallback(
    (entry: GitBranchChangeEntry, event?: SourceControlRowOpenEvent) => {
      if (
        !activeWorktreeId ||
        !worktreePath ||
        !branchSummary ||
        branchSummary.status !== 'ready'
      ) {
        return
      }
      if (
        revealCombinedDiffSection(
          {
            kind: 'branch',
            entry,
            compare: {
              baseRef: branchSummary.baseRef,
              baseOid: branchSummary.baseOid,
              headOid: branchSummary.headOid,
              mergeBase: branchSummary.mergeBase
            }
          },
          event
        )
      ) {
        return
      }
      const targetGroupId = resolveSplitTargetGroupId(event)
      const embeddedTargetTabId = targetGroupId ? undefined : workspacePanelTabId
      openBranchDiff(
        activeWorktreeId,
        worktreePath,
        entry,
        branchSummary,
        detectLanguage(entry.path),
        {
          targetGroupId,
          workspacePanelTabId: embeddedTargetTabId,
          preview: shouldOpenSourceControlRowAsPreview(event, targetGroupId)
        }
      )
    },
    [
      activeWorktreeId,
      branchSummary,
      openBranchDiff,
      resolveSplitTargetGroupId,
      revealCombinedDiffSection,
      workspacePanelTabId,
      worktreePath
    ]
  )
  const { loadCommitFiles, openHistoryCommitDiff, openCommitFile, handleCommitAction } =
    useGitHistoryCommitActions({
      activeWorktreeId,
      worktreePath,
      activeRepoSettings,
      workspacePanelTabId,
      resolveSplitTargetGroupId
    })
  // Why: a diff row click may be answered by revealing a section inside an
  // already-open combined diff, and that scroll lands two frames later — stamping
  // the note target synchronously would be consumed first and then scrolled over.
  const stampCommentScrollAfterReveal = useCallback(
    (commentId: string | undefined) => {
      if (!commentId) {
        return
      }
      requestSourceControlEditorRevealFrame(pendingCommentEditorRevealFrameIdsRef, () => {
        requestSourceControlEditorRevealFrame(pendingCommentEditorRevealFrameIdsRef, () => {
          setScrollToDiffCommentId(commentId)
        })
      })
    },
    [pendingCommentEditorRevealFrameIdsRef, setScrollToDiffCommentId]
  )
  const handleOpenComment = useCallback(
    (comment: DiffComment) => {
      if (!activeWorktreeId || !worktreePath) {
        return
      }
      const filePath = comment.filePath
      const commentId = comment.id
      // Defensively clear any dangling prior scroll request before routing
      // this click; only the diff branches below will re-stamp it.
      cancelSourceControlEditorRevealFrames(pendingCommentEditorRevealFrameIdsRef)
      setScrollToDiffCommentId(null)
      if (getDiffCommentSource(comment) === 'markdown') {
        const absPath = joinPath(worktreePath, filePath)
        const language = detectLanguage(filePath)
        setEditorViewMode(absPath, 'edit')
        setMarkdownViewMode(absPath, 'source')
        openFile(
          {
            filePath: absPath,
            relativePath: filePath,
            worktreeId: activeWorktreeId,
            language,
            mode: 'edit'
          },
          { workspacePanelTabId }
        )
        setPendingEditorReveal(null)
        requestSourceControlEditorRevealFrame(pendingCommentEditorRevealFrameIdsRef, () => {
          requestSourceControlEditorRevealFrame(pendingCommentEditorRevealFrameIdsRef, () => {
            setPendingEditorReveal({
              filePath: absPath,
              line: comment.lineNumber,
              column: 1,
              matchLength: 0
            })
            setScrollToDiffCommentId(commentId)
          })
        })
        return
      }
      const matches = entries.filter((e) => e.path === filePath)
      const uncommitted =
        matches.find((e) => e.area === 'unstaged') ??
        matches.find((e) => e.area === 'untracked') ??
        matches[0]
      if (uncommitted) {
        handleOpenDiff(uncommitted)
        stampCommentScrollAfterReveal(commentId)
        return
      }
      const branchEntry = branchEntries.find((e) => e.path === filePath)
      if (branchEntry && branchSummary?.status === 'ready') {
        openCommittedDiff(branchEntry)
        stampCommentScrollAfterReveal(commentId)
        return
      }
      // Why: stale notes may outlive both diff sources; open the normal editor
      // in Changes mode so its diff viewer can still honor the note scroll target.
      const absPath = joinPath(worktreePath, filePath)
      const language = detectLanguage(filePath)
      openFile(
        {
          filePath: absPath,
          relativePath: filePath,
          worktreeId: activeWorktreeId,
          language,
          mode: 'edit'
        },
        { workspacePanelTabId }
      )
      if (commentId) {
        setEditorViewMode(absPath, 'changes')
        setScrollToDiffCommentId(commentId)
      }
    },
    [
      activeWorktreeId,
      branchEntries,
      branchSummary,
      entries,
      handleOpenDiff,
      openCommittedDiff,
      openFile,
      pendingCommentEditorRevealFrameIdsRef,
      setEditorViewMode,
      setScrollToDiffCommentId,
      setMarkdownViewMode,
      setPendingEditorReveal,
      stampCommentScrollAfterReveal,
      workspacePanelTabId,
      worktreePath
    ]
  )
  const handleStage = useCallback(
    async (filePath: string) => {
      if (!worktreePath) {
        return
      }
      try {
        const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
        await stageRuntimeGitPath(
          {
            // Why: route staging by the repo OWNER host, not the focused runtime.
            settings: activeRepoSettings,
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId
          },
          filePath
        )
        await refreshActiveGitStatusAfterMutation()
      } catch {
        // git operation failed silently
      }
    },
    [activeRepoSettings, worktreePath, activeWorktreeId, refreshActiveGitStatusAfterMutation]
  )
  return {
    ...scope,
    toggleSection,
    toggleTreeDir,
    openCommittedDiff,
    loadCommitFiles,
    openHistoryCommitDiff,
    openCommitFile,
    handleCommitAction,
    handleOpenComment,
    handleStage
  }
}

export type SourceControlHistoryController = ReturnType<typeof useSourceControlHistory>
