import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { downloadRuntimeFile, type RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import { downloadRuntimeFolder } from '@/runtime/runtime-folder-download'

import type { TreeNode } from './file-explorer-types'

export function shouldShowCollapseFolderAction(node: TreeNode, isExpanded: boolean): boolean {
  return node.isDirectory && isExpanded
}

export function shouldShowFindInFolderAction(node: TreeNode): boolean {
  return node.isDirectory
}

export function shouldShowOpenInTerminalAction(node: TreeNode): boolean {
  return node.isDirectory
}

export function shouldShowViewFileAction(node: TreeNode): boolean {
  return !node.isDirectory
}

export function shouldShowRemoteDownloadAction(
  node: TreeNode,
  connectionId?: string | null,
  runtimeDownloadContext?: RuntimeFileOperationArgs | null,
  supportsFolderDownload = false
): boolean {
  // Why: download depends on Electron's native save dialog.
  return (
    Boolean(connectionId || runtimeDownloadContext) &&
    (!node.isDirectory || Boolean(runtimeDownloadContext) || supportsFolderDownload) &&
    (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ !== true
  )
}

export function shouldShowCopyFileAction(
  node: TreeNode,
  connectionId?: string | null,
  selectionSize = 1
): boolean {
  // Why: remote directories need recursive materialization semantics not supported here.
  return (
    (!connectionId || !node.isDirectory) &&
    selectionSize === 1 &&
    (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ !== true
  )
}

export async function downloadRemoteEntry(
  node: TreeNode,
  connectionIdOrRuntimeContext: string | RuntimeFileOperationArgs
): Promise<void> {
  try {
    const result =
      typeof connectionIdOrRuntimeContext === 'string'
        ? node.isDirectory
          ? await window.api.fs.downloadFolder({
              dirPath: node.path,
              connectionId: connectionIdOrRuntimeContext
            })
          : await window.api.fs.downloadFile({
              filePath: node.path,
              connectionId: connectionIdOrRuntimeContext
            })
        : node.isDirectory
          ? await downloadRuntimeFolder(connectionIdOrRuntimeContext, node.path, node.name)
          : await downloadRuntimeFile(connectionIdOrRuntimeContext, node.path, node.name)
    if (result.canceled) {
      return
    }
    toast.success(
      translate(
        'auto.components.right.sidebar.FileExplorerRow.bce4d4e44f',
        "Downloaded '{{value0}}'",
        { value0: node.name }
      ),
      {
        action: {
          label: translate('auto.components.right.sidebar.FileExplorerRow.1a3df04ae1', 'Open'),
          onClick: () => {
            void window.api.shell.openPath(result.destinationPath)
          }
        }
      }
    )
  } catch (error) {
    toast.error(
      extractIpcErrorMessage(
        error,
        translate(
          'auto.components.right.sidebar.FileExplorerRow.b3e288bf41',
          "Failed to download '{{value0}}'.",
          { value0: node.name }
        )
      )
    )
  }
}

export async function copyFileToOsClipboard(
  node: TreeNode,
  connectionId?: string | null
): Promise<void> {
  const failureMessage = translate(
    'auto.components.right.sidebar.FileExplorerRow.b234ab25b4',
    'Could not copy the file to the clipboard'
  )
  try {
    const result = await window.api.ui.writeClipboardFile(
      connectionId ? { filePath: node.path, connectionId } : node.path
    )
    if (!result.ok) {
      toast.error(failureMessage)
    }
  } catch (error) {
    toast.error(extractIpcErrorMessage(error, failureMessage))
  }
}
