import { Copy, ArrowSquareOut as ExternalLink } from '@phosphor-icons/react'
import React from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  useContextMenuPointAnchor
} from '~renderer/components/ui/context-menu'
import { translate } from '~renderer/i18n/i18n'
import { getConnectionId } from '~renderer/lib/connection-context'
import { getRuntimeGitRemoteFileUrl } from '~renderer/runtime/git-client'
import { useAppStore } from '~renderer/store'
import { findWorktreeById } from '~renderer/store/slices/worktree-helpers'

import { formatPathLineReference } from './line-copy-path'

type MonacoGutterContextMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  point: { x: number; y: number }
  line: number
  filePath: string
  relativePath: string
}

export function MonacoGutterContextMenu({
  open,
  onOpenChange,
  point,
  line,
  filePath,
  relativePath
}: MonacoGutterContextMenuProps): React.JSX.Element {
  // Why: Monaco reports the gutter right-click through its own onMouseDown API
  // and cancels the DOM event, so there is no element for a trigger to anchor to.
  const anchor = useContextMenuPointAnchor(point)

  return (
    <ContextMenu open={open} onOpenChange={onOpenChange}>
      <ContextMenuContent anchor={anchor}>
        <ContextMenuItem
          onClick={() => window.api.ui.writeClipboardText(formatPathLineReference(filePath, line))}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          {translate(
            'auto.components.editor.MonacoGutterContextMenu.4eaa991bde',
            'Copy Path to Line'
          )}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() =>
            window.api.ui.writeClipboardText(formatPathLineReference(relativePath, line))
          }
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          {translate(
            'auto.components.editor.MonacoGutterContextMenu.2e0b1cdc05',
            'Copy Rel. Path to Line'
          )}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={async () => {
            const state = useAppStore.getState()
            const activeFile = state.openFiles.find((f) => f.filePath === filePath)
            if (!activeFile) {
              return
            }
            const worktree = findWorktreeById(state.worktreesByRepo, activeFile.worktreeId)
            if (!worktree) {
              return
            }
            const connectionId = getConnectionId(activeFile?.worktreeId ?? null) ?? undefined
            const url = await getRuntimeGitRemoteFileUrl(
              {
                settings: state.settings,
                worktreeId: activeFile.worktreeId,
                worktreePath: worktree.path,
                connectionId
              },
              { relativePath, line }
            )
            if (url) {
              window.api.ui.writeClipboardText(url)
            }
          }}
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          {translate(
            'auto.components.editor.MonacoGutterContextMenu.7b57b1b468',
            'Copy Remote URL'
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
