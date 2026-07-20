import { Copy } from '@phosphor-icons/react'
import React from 'react'

import { ArrowSquareOut as ExternalLink } from '@/components/regular-icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { getConnectionId } from '@/lib/connection-context'
import { getRuntimeGitRemoteFileUrl } from '@/runtime/runtime-git-client'
import { useAppStore } from '@/store'
import { findWorktreeById } from '@/store/slices/worktree-helpers'

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
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger
        render={
          <button
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none fixed size-px opacity-0"
            style={{ left: point.x, top: point.y }}
          />
        }
      />
      <DropdownMenuContent sideOffset={0} align="start">
        <DropdownMenuItem
          onClick={() => window.api.ui.writeClipboardText(formatPathLineReference(filePath, line))}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          {translate(
            'auto.components.editor.MonacoGutterContextMenu.4eaa991bde',
            'Copy Path to Line'
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            window.api.ui.writeClipboardText(formatPathLineReference(relativePath, line))
          }
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          {translate(
            'auto.components.editor.MonacoGutterContextMenu.2e0b1cdc05',
            'Copy Rel. Path to Line'
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
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
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
