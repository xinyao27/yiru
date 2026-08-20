import {
  Files,
  FlowArrow as Workflow,
  GitMerge,
  ListChecks,
  Robot as Agent
} from '~renderer/components/icons/hugeicons'
import { translate } from '~renderer/i18n/i18n'

import type { ActivityBarItem } from './activity-bar-buttons'

export type RightSidebarActivityShortcuts = {
  explorer: string
  sourceControl: string
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
      title: translate('auto.components.workspace.panel.sourceControl.title', 'Changes & Review'),
      shortcut: assignedShortcut(shortcuts.sourceControl),
      gitOnly: true
    },
    {
      // Why: keeping Agent last here preserves its trailing position after visibility filtering.
      id: 'vault',
      icon: Agent,
      title: translate('auto.components.right.sidebar.index.aiVaultSessionHistory', 'Agents'),
      shortcut: ''
    }
  ]
}

function assignedShortcut(shortcut: string): string {
  return shortcut === 'Unassigned' ? '' : shortcut
}
