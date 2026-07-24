import { Files, FlowArrow as Workflow, GitMerge, ListChecks, Plug } from '@phosphor-icons/react'

import { translate } from '@/i18n/i18n'

import type { ActivityBarItem } from './activity-bar-buttons'
import { AgentSessionHistoryIcon } from './agent-session-history-icon'

export type RightSidebarActivityShortcuts = {
  explorer: string
  sourceControl: string
  checks: string
  ports: string
}

export function createRightSidebarActivityItems(
  shortcuts: RightSidebarActivityShortcuts
): ActivityBarItem[] {
  return [
    {
      id: 'explorer',
      icon: Files,
      title: translate('auto.components.right.sidebar.index.8bc2bbc3a0', 'Explorer'),
      shortcut: assignedShortcut(shortcuts.explorer)
    },
    {
      id: 'workspaces',
      icon: Workflow,
      iconWeight: 'regular',
      title: translate(
        'auto.components.right.sidebar.index.folderWorkspaces',
        'Attached worktrees'
      ),
      shortcut: '',
      folderOnly: true
    },
    {
      id: 'pr-checks',
      icon: ListChecks,
      title: translate('auto.components.right.sidebar.index.parentPrChecks', 'PR Checks'),
      shortcut: '',
      folderOnly: true
    },
    {
      id: 'source-control',
      icon: GitMerge,
      title: translate('auto.components.right.sidebar.index.0314901467', 'Source Control'),
      shortcut: assignedShortcut(shortcuts.sourceControl),
      gitOnly: true
    },
    {
      id: 'checks',
      icon: ListChecks,
      title: translate('auto.components.right.sidebar.index.83a10e3c44', 'Checks'),
      shortcut: assignedShortcut(shortcuts.checks),
      gitOnly: true
    },
    {
      id: 'ports',
      icon: Plug,
      title: translate('auto.components.right.sidebar.index.441733b630', 'Ports'),
      shortcut: assignedShortcut(shortcuts.ports),
      sshOnly: true
    },
    {
      // Why: keeping Agent last here preserves its trailing position after visibility filtering.
      id: 'vault',
      icon: AgentSessionHistoryIcon,
      title: translate('auto.components.right.sidebar.index.aiVaultSessionHistory', 'Agents'),
      shortcut: ''
    }
  ]
}

function assignedShortcut(shortcut: string): string {
  return shortcut === 'Unassigned' ? '' : shortcut
}
