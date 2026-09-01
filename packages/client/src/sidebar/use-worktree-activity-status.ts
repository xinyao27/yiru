import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '~renderer/store/state'
import { resolveWorktreeStatus, type WorktreeStatus } from '~renderer/worktree/status'

import { selectWorktreeAgentActivitySummary } from './worktree-agent-activity-summary'
import { EMPTY_BROWSER_TABS, EMPTY_TABS } from './worktree-card/presentation'
import { selectLivePtyIdsForWorktree } from './worktree-card/status-inputs'

export function useWorktreeActivityStatus(worktreeId: string): WorktreeStatus {
  const tabs = useAppStore((s) => s.tabsByWorktree[worktreeId] ?? EMPTY_TABS)
  const browserTabs = useAppStore((s) => s.browserTabsByWorktree[worktreeId] ?? EMPTY_BROWSER_TABS)
  const ptyIdsForWorktree = useAppStore(
    useShallow((s) => selectLivePtyIdsForWorktree(s, worktreeId))
  )
  const { agentPhase, hasRetainedComplete } = useAppStore((s) =>
    selectWorktreeAgentActivitySummary(s, worktreeId)
  )

  return resolveWorktreeStatus({
    agentPhase,
    browserTabs,
    hasRetainedComplete,
    ptyIdsByTabId: ptyIdsForWorktree,
    tabs
  })
}
