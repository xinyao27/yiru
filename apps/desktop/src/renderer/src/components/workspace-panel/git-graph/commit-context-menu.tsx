import { Copy, Globe, Hash, Sparkle as Sparkles } from '@phosphor-icons/react'
import type React from 'react'

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'

import type { GitHistoryItem } from '../../../../../shared/git/history'
import type { GitHistoryCommitAction } from '../git-history-commit-context-menu'

// Why: vscode-git-graph's commit context menu also offers checkout, cherry-pick,
// revert, drop, merge, rebase, reset, and create-branch/tag actions — none of
// those have a backend in this app (see use-git-history-commit-actions.ts), so
// this only wires the actions that already exist rather than rendering dead
// menu items or inventing new IPC surface.
export function GitGraphCommitContextMenu({
  item,
  onAction
}: {
  item: GitHistoryItem
  onAction: (action: GitHistoryCommitAction, item: GitHistoryItem) => void
}): React.JSX.Element {
  return (
    <ContextMenuContent className="w-56">
      <ContextMenuItem onClick={() => onAction('open-remote', item)}>
        <Globe className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitContextMenu.a1b2c3d4e5',
          'Open commit in browser'
        )}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onAction('copy-hash', item)}>
        <Hash className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitContextMenu.b2c3d4e5f6',
          'Copy commit hash'
        )}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onAction('copy-message', item)}>
        <Copy className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitContextMenu.c3d4e5f6a7',
          'Copy commit message'
        )}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onAction('explain', item)}>
        <Sparkles className="size-3.5" />
        {translate(
          'auto.components.workspace-panel.git-graph.CommitContextMenu.d4e5f6a7b8',
          'Explain changes'
        )}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
