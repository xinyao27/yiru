import { useMemo } from 'react'

import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import { useAppStore } from '@/store'
import { useRepoById } from '@/store/selectors'

import { isFolderRepo } from '../../../../shared/repo-kind'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import type { ActivityBarItem } from './activity-bar-buttons'
import { createRightSidebarActivityItems } from './right-sidebar-activity-items'
import { getVisibleRightSidebarActivityItems } from './right-sidebar-activity-visibility'

export function useRightSidebarActivityItems(worktreeId: string | null): {
  isFolderWorkspace: boolean
  items: ActivityBarItem[]
} {
  const explorerShortcut = useShortcutLabel('sidebar.explorer.toggle')
  const sourceControlShortcut = useShortcutLabel('sidebar.sourceControl.toggle')
  const checksShortcut = useShortcutLabel('sidebar.checks.toggle')
  const portsShortcut = useShortcutLabel('sidebar.ports.toggle')
  const worktree = useAppStore((state) =>
    worktreeId ? (state.getKnownWorktreeById(worktreeId) ?? null) : null
  )
  const repo = useRepoById(worktree?.repoId ?? null)
  const workspaceScope = parseWorkspaceKey(worktreeId ?? '')
  const isFolderWorkspace = workspaceScope?.type === 'folder'
  const isFolder = isFolderWorkspace || (repo ? isFolderRepo(repo) : false)
  const isSshRepo = Boolean(repo?.connectionId)
  const items = useMemo(() => {
    if (worktreeId && !worktree) {
      return []
    }
    // Why: the mounted-but-closed sidebar intentionally drops its workspace
    // scope; retain the generic local entries so effective-tab resolution stays valid.
    return getVisibleRightSidebarActivityItems(
      createRightSidebarActivityItems({
        explorer: explorerShortcut,
        sourceControl: sourceControlShortcut,
        checks: checksShortcut,
        ports: portsShortcut
      }),
      { isFolder, isFolderWorkspace, isSshRepo }
    )
  }, [
    checksShortcut,
    explorerShortcut,
    isFolder,
    isFolderWorkspace,
    isSshRepo,
    portsShortcut,
    sourceControlShortcut,
    worktree,
    worktreeId
  ])

  return { isFolderWorkspace, items }
}
