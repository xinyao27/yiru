import { useEffect, useRef } from 'react'
import type { RightSidebarPanelSource } from '~renderer/components/workspace-panel/right-sidebar-panel-source'
import { useAppStore } from '~renderer/store'
import { useActiveWorktree, useRepoById } from '~renderer/store/selectors'
import { isFolderRepo } from '~shared/repo-kind'

/**
 * Opens the combined "All Changes" diff in the panel's editor half the first
 * time a Changes/Review tab shows up with nothing loaded.
 *
 * Why: the panel exists to review the whole change set, so landing on the
 * editor empty state made every session start with the same manual "View all"
 * click. It fires once per panel tab + workspace, so closing the combined diff
 * or opening a single file is never undone.
 */
export function useAutoOpenAllDiffs({
  source,
  isVisible,
  workspacePanelTabId
}: {
  source: RightSidebarPanelSource
  isVisible: boolean
  workspacePanelTabId: string | undefined
}): void {
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = activeWorktree?.id ?? null
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const openAllDiffs = useAppStore((state) => state.openAllDiffs)
  const hasEditorTarget = useAppStore((state) =>
    workspacePanelTabId ? Boolean(state.workspacePanelEditorFileIdByTab[workspacePanelTabId]) : true
  )
  const changeCount = useAppStore((state) =>
    activeWorktreeId
      ? (state.gitStatusByWorktree[activeWorktreeId]?.length ?? 0) +
        (state.gitBranchChangesByWorktree[activeWorktreeId]?.length ?? 0)
      : 0
  )
  const openedKeysRef = useRef(new Set<string>())

  useEffect(() => {
    const worktreePath = activeWorktree?.path
    if (
      source.kind !== 'local' ||
      !isVisible ||
      !workspacePanelTabId ||
      !activeWorktreeId ||
      !worktreePath ||
      hasEditorTarget ||
      changeCount === 0 ||
      !activeRepo ||
      isFolderRepo(activeRepo)
    ) {
      return
    }

    const key = `${workspacePanelTabId}::${activeWorktreeId}`
    if (openedKeysRef.current.has(key)) {
      return
    }
    openedKeysRef.current.add(key)
    openAllDiffs(activeWorktreeId, worktreePath, undefined, undefined, undefined, {
      workspacePanelTabId
    })
  }, [
    activeRepo,
    activeWorktree?.path,
    activeWorktreeId,
    changeCount,
    hasEditorTarget,
    isVisible,
    openAllDiffs,
    source.kind,
    workspacePanelTabId
  ])
}
