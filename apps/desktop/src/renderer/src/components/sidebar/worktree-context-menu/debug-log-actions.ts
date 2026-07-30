import { useCallback } from 'react'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import { detectLanguage } from '@/lib/language-detect'
import { joinPath } from '@/lib/path'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { RuntimeFileOperationArgs } from '@/runtime/file-client'
import { deleteRuntimePath, readRuntimeDirectory, runtimePathExists } from '@/runtime/file-client'
import { useAppStore } from '@/store'

import type { WorktreeContextMenuState } from './state'

// Why: the yiru-debug skill instructs agents to write NDJSON logs under this
// Yiru-reserved worktree directory; the menu reads and clears the same place.
const WORKTREE_DEBUG_LOG_DIR = '.yiru/debug'
const MAX_OPENED_DEBUG_LOG_FILES = 10

type OpenDebugLogFile = (file: {
  filePath: string
  relativePath: string
  worktreeId: string
  language: string
  mode: 'edit'
}) => void

async function listDebugLogFileNames(
  context: RuntimeFileOperationArgs,
  logRootPath: string
): Promise<string[]> {
  if (!(await runtimePathExists(context, logRootPath))) {
    return []
  }
  const entries = await readRuntimeDirectory(context, logRootPath)
  return entries
    .filter((entry) => !entry.isDirectory && !entry.isSymlink)
    .map((entry) => entry.name)
    .sort((first, second) => first.localeCompare(second))
}

function toastNoDebugLogs(): void {
  toast.info(
    translate(
      'auto.components.sidebar.WorktreeContextMenu.noDebugLogs',
      'No debug logs in this worktree.'
    )
  )
}

async function viewDebugLogs(args: {
  context: RuntimeFileOperationArgs
  worktreeId: string
  worktreePath: string
  openFile: OpenDebugLogFile
}): Promise<void> {
  const logRootPath = joinPath(args.worktreePath, WORKTREE_DEBUG_LOG_DIR)
  const fileNames = await listDebugLogFileNames(args.context, logRootPath)
  if (fileNames.length === 0) {
    toastNoDebugLogs()
    return
  }
  activateAndRevealWorktree(args.worktreeId)
  for (const fileName of fileNames.slice(0, MAX_OPENED_DEBUG_LOG_FILES)) {
    args.openFile({
      filePath: joinPath(logRootPath, fileName),
      relativePath: `${WORKTREE_DEBUG_LOG_DIR}/${fileName}`,
      worktreeId: args.worktreeId,
      language: detectLanguage(fileName),
      mode: 'edit'
    })
  }
}

async function clearDebugLogs(args: {
  context: RuntimeFileOperationArgs
  worktreePath: string
}): Promise<void> {
  const logRootPath = joinPath(args.worktreePath, WORKTREE_DEBUG_LOG_DIR)
  if (!(await runtimePathExists(args.context, logRootPath))) {
    toastNoDebugLogs()
    return
  }
  await deleteRuntimePath(args.context, logRootPath, true)
  toast.success(
    translate('auto.components.sidebar.WorktreeContextMenu.debugLogsCleared', 'Debug logs cleared.')
  )
}

export function useDebugLogMenuActions(args: { state: WorktreeContextMenuState }) {
  const { repo, worktree } = args.state
  const settings = useAppStore((store) => store.settings)
  const openFile = useAppStore((store) => store.openFile)
  const connectionId = repo?.connectionId ?? undefined

  const handleViewDebugLogs = useCallback(() => {
    const context: RuntimeFileOperationArgs = {
      settings,
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      connectionId
    }
    viewDebugLogs({
      context,
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      openFile
    }).catch(() => {
      toast.error(
        translate(
          'auto.components.sidebar.WorktreeContextMenu.viewDebugLogsFailed',
          'Could not read debug logs.'
        )
      )
    })
  }, [connectionId, openFile, settings, worktree.id, worktree.path])

  const handleClearDebugLogs = useCallback(() => {
    const context: RuntimeFileOperationArgs = {
      settings,
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      connectionId
    }
    clearDebugLogs({ context, worktreePath: worktree.path }).catch(() => {
      toast.error(
        translate(
          'auto.components.sidebar.WorktreeContextMenu.clearDebugLogsFailed',
          'Could not clear debug logs.'
        )
      )
    })
  }, [connectionId, settings, worktree.id, worktree.path])

  return {
    handleClearDebugLogs,
    handleViewDebugLogs
  }
}

export type DebugLogMenuActions = ReturnType<typeof useDebugLogMenuActions>
