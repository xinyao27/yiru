import { useCallback } from 'react'
import { toast } from 'sonner'

import { requestEditorSaveQuiesce } from '@/components/editor/editor-autosave'
import { getConnectionId } from '@/lib/connection-context'
import { basename, dirname, joinPath } from '@/lib/path'
import { remapOpenEditorTabsForPathChange } from '@/lib/remap-open-editor-tabs-for-path-change'
import { renameRuntimePath } from '@/runtime/runtime-file-client'
import { useAppStore } from '@/store'

import { getRightSidebarWorktreeRuntimeSettings } from './file-explorer-runtime-owner'
import { commitFileExplorerOp } from './file-explorer-undo-redo'

function extractIpcErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback
  }
  const match = error.message.match(/Error invoking remote method '[^']*': (?:Error: )?(.+)/)
  return match ? match[1] : error.message
}

export function useFileExplorerPathMove({
  worktreePath,
  activeWorktreeId,
  refreshDir,
  clearDropTarget
}: {
  worktreePath: string | null
  activeWorktreeId: string | null
  refreshDir: (dirPath: string) => Promise<void>
  clearDropTarget: () => void
}): (sourcePath: string, destDir: string) => void {
  const openFiles = useAppStore((state) => state.openFiles)

  return useCallback(
    (sourcePath: string, destDir: string) => {
      if (!worktreePath || !activeWorktreeId) {
        return
      }
      const fileName = basename(sourcePath)
      const sourceDir = dirname(sourcePath)
      clearDropTarget()
      if (
        sourceDir === destDir ||
        destDir === sourcePath ||
        destDir.startsWith(`${sourcePath}/`) ||
        destDir.startsWith(`${sourcePath}\\`)
      ) {
        return
      }

      const newPath = joinPath(destDir, fileName)
      const remapOpenTabs = (fromPath: string, toPath: string): void =>
        remapOpenEditorTabsForPathChange({
          fromPath,
          toPath,
          worktreePath,
          worktreeId: activeWorktreeId
        })
      const run = async (): Promise<void> => {
        const filesToMove = openFiles.filter(
          (file) =>
            file.filePath === sourcePath ||
            file.filePath.startsWith(`${sourcePath}/`) ||
            file.filePath.startsWith(`${sourcePath}\\`)
        )
        // Why: a move changes the write target, so settle saves before remapping tabs.
        await Promise.all(filesToMove.map((file) => requestEditorSaveQuiesce({ fileId: file.id })))

        try {
          const connectionId = getConnectionId(activeWorktreeId) ?? undefined
          const fileContext = {
            settings: getRightSidebarWorktreeRuntimeSettings(activeWorktreeId),
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId
          }
          await renameRuntimePath(fileContext, sourcePath, newPath)
          commitFileExplorerOp({
            undo: async () => {
              await renameRuntimePath(fileContext, newPath, sourcePath)
              await Promise.all([refreshDir(destDir), refreshDir(sourceDir)])
              remapOpenTabs(newPath, sourcePath)
            },
            redo: async () => {
              await renameRuntimePath(fileContext, sourcePath, newPath)
              await Promise.all([refreshDir(sourceDir), refreshDir(destDir)])
              remapOpenTabs(sourcePath, newPath)
            }
          })
        } catch (error) {
          toast.error(extractIpcErrorMessage(error, `Failed to move '${fileName}'.`))
          return
        }
        await Promise.all([refreshDir(sourceDir), refreshDir(destDir)])
        remapOpenTabs(sourcePath, newPath)
      }
      void run()
    },
    [activeWorktreeId, clearDropTarget, openFiles, refreshDir, worktreePath]
  )
}
