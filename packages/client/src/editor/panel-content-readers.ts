import type { OpenFile } from '~renderer/editor/state'
import {
  getConnectionIdForFile,
  isWorktreeConnectionResolved
} from '~renderer/runtime/connection-context'
import { getRuntimeFileReadScope, readRuntimeFileContent } from '~renderer/runtime/file-client'
import {
  getRuntimeGitBranchDiff,
  getRuntimeGitCommitDiff,
  getRuntimeGitDiff,
  getRuntimeGitScope
} from '~renderer/runtime/git-client'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { useAppStore } from '~renderer/store/state'

import { getDiskBaselineSignature } from './diff-content-signature'
import { getFilePreview } from './file-preview-kind'
import {
  WORKTREE_OWNER_NOT_READY_ERROR,
  type DiffContent,
  type FileContent
} from './panel-content-types'

const inFlightFileReads = new Map<string, Promise<FileContent>>()
const inFlightDiffReads = new Map<string, Promise<DiffContent>>()

type ReadEditorFileContentParams = {
  filePath: string
  force?: boolean
  relativePath?: string
  restoredOpenFile?: OpenFile
  worktreeId?: string
}

function inFlightReadKey(connectionId: string | undefined, filePath: string): string {
  return `${connectionId ?? ''}::${filePath}`
}

function inFlightDiffKey(
  file: OpenFile,
  connectionId: string | undefined,
  compareAgainstHead: boolean
): string {
  const branch =
    file.diffSource === 'branch' && file.branchCompare
      ? `${file.branchCompare.baseOid ?? ''}..${file.branchCompare.headOid ?? ''}::${file.branchOldPath ?? ''}`
      : ''
  const commit =
    file.diffSource === 'commit' && file.commitCompare
      ? `${file.commitCompare.parentOid ?? 'empty-tree'}..${file.commitCompare.commitOid}::${file.branchOldPath ?? ''}`
      : ''
  return `${connectionId ?? ''}::${file.diffSource ?? ''}::${compareAgainstHead ? 'head' : 'default'}::${file.filePath}::${branch}::${commit}`
}

export async function readEditorFileContent({
  filePath,
  force,
  relativePath,
  restoredOpenFile,
  worktreeId
}: ReadEditorFileContentParams): Promise<FileContent> {
  const resolvedConnectionId = getConnectionIdForFile(worktreeId ?? null, filePath)
  const connectionId = resolvedConnectionId ?? undefined
  const activeSettings = useAppStore.getState().settings
  const readSettings = settingsForRuntimeOwner(
    activeSettings,
    restoredOpenFile?.runtimeEnvironmentId
  )
  if (
    resolvedConnectionId === undefined &&
    !readSettings?.activeRuntimeEnvironmentId?.trim() &&
    !isWorktreeConnectionResolved(worktreeId ?? null)
  ) {
    // Why: until the repo hydrates, reading locally could turn a remote path
    // into a terminal access-denied error instead of a retryable owner wait.
    throw new Error(WORKTREE_OWNER_NOT_READY_ERROR)
  }
  if (restoredOpenFile?.filePath === filePath && restoredOpenFile.relativePath === filePath) {
    if (readSettings?.activeRuntimeEnvironmentId?.trim() || connectionId) {
      throw new Error('External local files are not available for remote workspaces.')
    }
    // Why: the main process keeps external-path grants only for this app session.
    await workspaceHostClient.fileHost.authorizeExternalPath({ targetPath: filePath })
  }

  const preview = getFilePreview(filePath)
  if (preview) {
    // Why: previewable binaries can be hundreds of megabytes. Their viewer
    // reads bounded chunks into a Blob instead of routing them through the
    // text/base64 read limit before the preview has a chance to render.
    return { content: '', isBinary: true, preview, mimeType: preview.mimeType }
  }

  const readScope = getRuntimeFileReadScope(readSettings, connectionId)
  const key = inFlightReadKey(readScope, filePath)
  if (force) {
    inFlightFileReads.delete(key)
  }
  let pending = inFlightFileReads.get(key)
  if (!pending) {
    pending = readRuntimeFileContent({
      settings: readSettings,
      filePath,
      relativePath: restoredOpenFile?.relativePath ?? relativePath,
      worktreeId,
      connectionId,
      includeLocalLogMetadata:
        restoredOpenFile?.readOnly === true && restoredOpenFile.liveTail === true
    })
    inFlightFileReads.set(key, pending)
    queueMicrotask(() => {
      if (inFlightFileReads.get(key) === pending) {
        inFlightFileReads.delete(key)
      }
    })
  }
  return pending
}

export async function readEditorDiffContent(file: OpenFile, force: boolean): Promise<DiffContent> {
  const worktreePath = file.filePath.slice(0, file.filePath.length - file.relativePath.length - 1)
  const branchCompare =
    file.branchCompare?.baseOid && file.branchCompare.headOid && file.branchCompare.mergeBase
      ? {
          ...file.branchCompare,
          baseOid: file.branchCompare.baseOid,
          headOid: file.branchCompare.headOid,
          mergeBase: file.branchCompare.mergeBase
        }
      : null
  const commitCompare = file.commitCompare?.commitOid ? file.commitCompare : null
  const connectionId = getConnectionIdForFile(file.worktreeId, file.filePath) ?? undefined
  const activeSettings = useAppStore.getState().settings
  const fileSettings = settingsForRuntimeOwner(activeSettings, file.runtimeEnvironmentId)
  const gitScope = getRuntimeGitScope(fileSettings, connectionId)
  const effectiveDiffSource: typeof file.diffSource =
    file.mode === 'edit' ? 'unstaged' : file.diffSource
  const compareAgainstHead = file.mode === 'edit'
  const key = inFlightDiffKey(
    { ...file, diffSource: effectiveDiffSource },
    gitScope ?? undefined,
    compareAgainstHead
  )
  if (force) {
    inFlightDiffReads.delete(key)
  }
  let pending = inFlightDiffReads.get(key)
  if (!pending) {
    pending =
      effectiveDiffSource === 'commit'
        ? commitCompare
          ? getRuntimeGitCommitDiff(
              {
                settings: fileSettings,
                worktreeId: file.worktreeId,
                worktreePath,
                connectionId
              },
              {
                commitOid: commitCompare.commitOid,
                parentOid: commitCompare.parentOid,
                filePath: file.relativePath,
                oldPath: file.branchOldPath
              }
            )
          : Promise.reject(new Error('Missing commit comparison for diff tab.'))
        : effectiveDiffSource === 'branch' && branchCompare
          ? getRuntimeGitBranchDiff(
              {
                settings: fileSettings,
                worktreeId: file.worktreeId,
                worktreePath,
                connectionId
              },
              {
                compare: branchCompare,
                filePath: file.relativePath,
                oldPath: file.branchOldPath
              }
            )
          : getRuntimeGitDiff(
              {
                settings: fileSettings,
                worktreeId: file.worktreeId,
                worktreePath,
                connectionId
              },
              {
                filePath: file.relativePath,
                staged: effectiveDiffSource === 'staged',
                compareAgainstHead
              }
            )
    inFlightDiffReads.set(key, pending)
    queueMicrotask(() => {
      if (inFlightDiffReads.get(key) === pending) {
        inFlightDiffReads.delete(key)
      }
    })
  }
  return pending
}

export function stampCleanTabDiskBaseline(id: string, result: FileContent): void {
  if (result.isBinary || result.loadError) {
    return
  }
  try {
    const state = useAppStore.getState()
    const loadedFile = state.openFiles.find((file) => file.id === id)
    if (loadedFile && !loadedFile.isDirty) {
      state.setLastKnownDiskSignature(id, getDiskBaselineSignature(result.content))
    }
  } catch (error) {
    // Why: metadata stamping must not turn delivered content into an error view.
    console.warn('[editor] failed to stamp disk baseline', error)
  }
}
