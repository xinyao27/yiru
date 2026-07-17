import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  SPOOL_FILE_READ_MAX_BYTES,
  SPOOL_FILE_WRITE_MAX_BYTES,
  type SpoolFileDiffResult,
  type SpoolFileReadResult,
  type SpoolFileTreeEntry
} from '../../../../shared/spool/spool-operation-contract'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  resolveSpoolWorktreeRoute,
  selectSpoolCanControl
} from '@/store/slices/spool-sharing-selectors'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'
import { SpoolFileActionDialog, type SpoolFileAction } from './SpoolFileActionDialog'
import { SpoolFilePreview } from './SpoolFilePreview'
import { SpoolFileTree } from './SpoolFileTree'
import {
  parseSpoolFileDiffResult,
  parseSpoolFileReadResult,
  parseSpoolMutationResult
} from './spool-owner-result-validation'
import {
  invokeSpoolWorkspaceMutation,
  invokeSpoolWorkspaceRead,
  SpoolWorkspaceOperationError
} from './spool-workspace-operation'
import { reportSpoolFileMutationError } from './spool-workspace-mutation-feedback'
import { SpoolMutationOutcomeNotice } from './SpoolMutationOutcomeNotice'
import {
  executeSpoolFileAction,
  isValidSpoolEntryName,
  joinSpoolRelativePath,
  nextSelectedSpoolFileEntry,
  parentSpoolRelativePath
} from './spool-file-mutation'
import { useSpoolWorktreeOperationRoute } from './spool-worktree-route'
import { useSpoolFileTreeState } from './useSpoolFileTreeState'

export function SpoolFilesPane({
  route,
  supportsDiff
}: {
  route: SpoolWorkspaceRoute
  supportsDiff: boolean
}): React.JSX.Element {
  const operationRoute = useSpoolWorktreeOperationRoute(route)
  const canControl = useAppStore((state) => selectSpoolCanControl(state, operationRoute))
  const worktreeName = useAppStore(
    (state) => resolveSpoolWorktreeRoute(state, route)?.worktree.name ?? 'Worktree'
  )
  const [directory, setDirectory] = useState('')
  const fileTree = useSpoolFileTreeState(operationRoute)
  const [selectedEntry, setSelectedEntry] = useState<SpoolFileTreeEntry | null>(null)
  const [file, setFile] = useState<SpoolFileReadResult | null>(null)
  const [draft, setDraft] = useState('')
  const [fileLoading, setFileLoading] = useState(false)
  const [fileUnavailable, setFileUnavailable] = useState(false)
  const [diff, setDiff] = useState<SpoolFileDiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffUnavailable, setDiffUnavailable] = useState(false)
  const [action, setAction] = useState<SpoolFileAction | null>(null)
  const [mutating, setMutating] = useState(false)
  const [mutationOutcomeUnknown, setMutationOutcomeUnknown] = useState(false)
  const [sidebarView, setSidebarView] = useState<'tree' | 'preview'>('tree')
  const canMutate = canControl && !mutationOutcomeUnknown
  const fileRequestSequence = useRef(0)
  const diffRequestSequence = useRef(0)
  const { loadDirectory } = fileTree

  const loadFile = useCallback(
    async (entry: SpoolFileTreeEntry, offset = 0): Promise<void> => {
      const request = ++fileRequestSequence.current
      diffRequestSequence.current += 1
      setSelectedEntry(entry)
      setFile(null)
      setDiff(null)
      setFileUnavailable(false)
      setDiffUnavailable(false)
      setFileLoading(true)
      try {
        const value = await invokeSpoolWorkspaceRead(operationRoute, 'files.read', {
          relativePath: entry.relativePath,
          offset,
          maxBytes: SPOOL_FILE_READ_MAX_BYTES
        })
        const result = parseSpoolFileReadResult(value)
        if (request === fileRequestSequence.current) {
          setFile(result)
          setDraft(result.encoding === 'utf8' ? result.content : '')
        }
      } catch (error) {
        if (request === fileRequestSequence.current && !isStaleRouteError(error)) {
          setFileUnavailable(true)
          toast.error(
            translate(
              'auto.components.spool.SpoolFilesPane.readFailed',
              'Could not read this file.'
            )
          )
        }
      } finally {
        if (request === fileRequestSequence.current) {
          setFileLoading(false)
        }
      }
    },
    [operationRoute]
  )

  useEffect(() => {
    const fileRequests = fileRequestSequence
    const diffRequests = diffRequestSequence
    return () => {
      fileRequests.current += 1
      diffRequests.current += 1
    }
  }, [])

  useEffect(() => {
    if (!canMutate) {
      setAction(null)
    }
  }, [canMutate])

  const openEntry = (entry: SpoolFileTreeEntry): void => {
    if (entry.kind === 'directory') {
      fileRequestSequence.current += 1
      diffRequestSequence.current += 1
      setSelectedEntry(entry)
      setDirectory(entry.relativePath)
      setFile(null)
      setDiff(null)
      setFileUnavailable(false)
      setDiffUnavailable(false)
      setSidebarView('tree')
      fileTree.toggleDirectory(entry.relativePath)
      return
    }
    setDirectory(parentSpoolRelativePath(entry.relativePath))
    setSidebarView('preview')
    void loadFile(entry)
  }

  const loadDiff = async (staged: boolean): Promise<void> => {
    if (!supportsDiff || !selectedEntry || selectedEntry.kind === 'directory') {
      return
    }
    const request = ++diffRequestSequence.current
    const expectedPath = selectedEntry.relativePath
    setDiffLoading(true)
    setDiffUnavailable(false)
    try {
      const value = await invokeSpoolWorkspaceRead(operationRoute, 'files.diff', {
        relativePath: expectedPath,
        staged
      })
      if (request === diffRequestSequence.current) {
        setDiff(parseSpoolFileDiffResult(value))
      }
    } catch (error) {
      if (request === diffRequestSequence.current && !isStaleRouteError(error)) {
        setDiffUnavailable(true)
        toast.error(
          translate('auto.components.spool.SpoolFilesPane.diffFailed', 'Could not load this diff.')
        )
      }
    } finally {
      if (request === diffRequestSequence.current) {
        setDiffLoading(false)
      }
    }
  }

  const saveFile = async (): Promise<void> => {
    if (!file || !selectedEntry || !canMutate) {
      return
    }
    if (new TextEncoder().encode(draft).byteLength > SPOOL_FILE_WRITE_MAX_BYTES) {
      toast.error(
        translate(
          'auto.components.spool.SpoolFilesPane.fileTooLarge',
          'This file is too large to save through Spool.'
        )
      )
      return
    }
    setMutating(true)
    try {
      const value = await invokeSpoolWorkspaceMutation(operationRoute, 'files.write', {
        relativePath: file.relativePath,
        content: draft,
        encoding: 'utf8',
        mode: 'replace'
      })
      parseSpoolMutationResult(value)
      diffRequestSequence.current += 1
      setDiff(null)
      setDiffUnavailable(false)
      await Promise.all([loadDirectory(directory), loadFile(selectedEntry)])
      toast.success(translate('auto.components.spool.SpoolFilesPane.saved', 'File saved.'))
    } catch (error) {
      if (
        reportSpoolFileMutationError(
          error,
          translate('auto.components.spool.SpoolFilesPane.saveFailed', 'Could not save this file.')
        )
      ) {
        setMutationOutcomeUnknown(true)
      }
    } finally {
      setMutating(false)
    }
  }

  const submitAction = async (name: string): Promise<void> => {
    if (!action || !canMutate || mutating) {
      return
    }
    if (action.kind !== 'delete' && !isValidSpoolEntryName(name)) {
      toast.error(
        translate(
          'auto.components.spool.SpoolFilesPane.invalidName',
          'Enter a single valid file name.'
        )
      )
      return
    }
    setMutating(true)
    try {
      await executeSpoolFileAction(operationRoute, directory, action, name)
      diffRequestSequence.current += 1
      const destinationPath = joinSpoolRelativePath(
        action.kind === 'rename' ? parentSpoolRelativePath(action.entry.relativePath) : directory,
        name
      )
      const nextEntry = nextSelectedSpoolFileEntry(action, selectedEntry, destinationPath, name)
      setAction(null)
      if (
        selectedEntry &&
        action.kind === 'delete' &&
        selectedEntry.relativePath === action.entry.relativePath
      ) {
        setSelectedEntry(null)
        setFile(null)
        setSidebarView('tree')
      }
      await loadDirectory(directory)
      if (nextEntry) {
        await loadFile(nextEntry)
      }
    } catch (error) {
      if (
        reportSpoolFileMutationError(
          error,
          translate(
            'auto.components.spool.SpoolFilesPane.mutationFailed',
            'Could not change this file.'
          )
        )
      ) {
        setMutationOutcomeUnknown(true)
      }
    } finally {
      setMutating(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {mutationOutcomeUnknown ? (
        <SpoolMutationOutcomeNotice
          description={translate(
            'auto.components.spool.SpoolFilesPane.outcomeUnknownPersistent',
            'The file change may have succeeded. Refresh and inspect the item before making another change.'
          )}
          onDismiss={() => setMutationOutcomeUnknown(false)}
        />
      ) : null}
      <div className="flex min-h-0 flex-1">
        {sidebarView === 'tree' ? (
          <SpoolFileTree
            canControl={canMutate}
            expanded={fileTree.expanded}
            listings={fileTree.listings}
            loadingDirectories={fileTree.loadingDirectories}
            unavailableDirectories={fileTree.unavailableDirectories}
            repoName={worktreeName}
            selectedPath={selectedEntry?.relativePath ?? null}
            showDotfiles={fileTree.showDotfiles}
            onOpen={openEntry}
            onRefresh={fileTree.refreshTree}
            onRetryDirectory={(relativePath) => void fileTree.loadDirectory(relativePath)}
            onCollapseAll={fileTree.collapseAll}
            onToggleDotfiles={fileTree.toggleDotfiles}
            onNewFile={(target) => {
              setDirectory(target?.relativePath ?? directory)
              if (target) {
                fileTree.expandDirectory(target.relativePath)
              }
              setAction({ kind: 'new-file' })
            }}
            onNewDirectory={(target) => {
              setDirectory(target?.relativePath ?? directory)
              if (target) {
                fileTree.expandDirectory(target.relativePath)
              }
              setAction({ kind: 'new-directory' })
            }}
            onRename={(entry) => setAction({ kind: 'rename', entry })}
            onDelete={(entry) => setAction({ kind: 'delete', entry })}
          />
        ) : null}
        {sidebarView === 'preview' ? (
          <SpoolFilePreview
            // Why: each read clears `file`, so this boundary resets preview mode before new bytes appear.
            key={file?.relativePath ?? 'empty'}
            canControl={canMutate}
            draft={draft}
            file={file}
            fileEntry={selectedEntry}
            fileUnavailable={fileUnavailable}
            loading={fileLoading}
            saving={mutating}
            supportsDiff={supportsDiff}
            diff={diff}
            diffLoading={diffLoading}
            diffUnavailable={diffUnavailable}
            onBack={() => setSidebarView('tree')}
            onDraftChange={setDraft}
            onLoadDiff={(staged) => void loadDiff(staged)}
            onNextChunk={() =>
              selectedEntry && file && void loadFile(selectedEntry, file.offset + file.bytesRead)
            }
            onPreviousChunk={() =>
              selectedEntry &&
              file &&
              void loadFile(selectedEntry, Math.max(0, file.offset - SPOOL_FILE_READ_MAX_BYTES))
            }
            onRefresh={() => selectedEntry && void loadFile(selectedEntry, file?.offset ?? 0)}
            onSave={() => void saveFile()}
            onRename={() => selectedEntry && setAction({ kind: 'rename', entry: selectedEntry })}
            onDelete={() => selectedEntry && setAction({ kind: 'delete', entry: selectedEntry })}
          />
        ) : null}
        <SpoolFileActionDialog
          action={action}
          busy={mutating}
          onClose={() => setAction(null)}
          onSubmit={submitAction}
        />
      </div>
    </div>
  )
}

function isStaleRouteError(error: unknown): boolean {
  return error instanceof SpoolWorkspaceOperationError && error.code === 'stale_route'
}
