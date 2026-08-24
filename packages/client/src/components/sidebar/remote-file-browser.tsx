import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'

import { RemoteFileBrowserBreadcrumbs } from './remote-file-browser-breadcrumbs'
import { RemoteFileBrowserInput } from './remote-file-browser-input'
import { RemoteFileBrowserList } from './remote-file-browser-list'
import {
  decideEnterAction,
  decideEscAction,
  filterEntries,
  isRemoteFileBrowserPathResolveTextTooLarge,
  joinPath,
  parentPath,
  parsePathInput,
  type DirEntry
} from './remote-file-browser-state'
import { useRemoteDirectory } from './use-remote-directory'
import { useRemotePathPreview } from './use-remote-path-preview'

type RemoteFileBrowserProps = {
  runtimeEnvironmentId: string
  initialPath?: string
  onSelect: (path: string) => void
  onCancel: () => void
}

const FILE_HINT_MS = 2000
const ROW_CLICK_DELAY_MS = 220

export function RemoteFileBrowser({
  runtimeEnvironmentId,
  initialPath = '~',
  onSelect,
  onCancel
}: RemoteFileBrowserProps): React.JSX.Element {
  const [fileHint, setFileHint] = useState(false)
  const fileHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearFileHint = useCallback(() => {
    if (fileHintTimerRef.current) {
      clearTimeout(fileHintTimerRef.current)
      fileHintTimerRef.current = null
    }
    setFileHint(false)
  }, [])
  const { entries, error, fetchListing, homePathRef, loadDirectory, loading, resolvedPath } =
    useRemoteDirectory(runtimeEnvironmentId, initialPath)
  const {
    filter,
    handleInputChange,
    handleInputPaste,
    inputRef,
    preview,
    previewEntries,
    resetInput
  } = useRemotePathPreview({
    clearFileHint,
    fetchListing,
    homePathRef,
    resolvedPath
  })

  const navigate = useCallback(
    (path: string): void => {
      resetInput()
      clearFileHint()
      void loadDirectory(path)
    },
    [clearFileHint, loadDirectory, resetInput]
  )
  const navigateUp = useCallback((): void => {
    if (resolvedPath !== '/') {
      navigate(parentPath(resolvedPath))
    }
  }, [navigate, resolvedPath])
  const filteredEntries = useMemo(() => filterEntries(entries, filter), [entries, filter])
  const triggerFileHint = useCallback((): void => {
    if (fileHintTimerRef.current) {
      clearTimeout(fileHintTimerRef.current)
    }
    setFileHint(true)
    fileHintTimerRef.current = setTimeout(() => {
      setFileHint(false)
      fileHintTimerRef.current = null
    }, FILE_HINT_MS)
  }, [])
  const listParentPath = preview?.resolvedPath ?? resolvedPath
  const handleRowClick = useCallback(
    (entry: DirEntry): void => {
      if (preview?.loading) {
        return
      }
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
      }
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null
        if (entry.isDirectory) {
          navigate(joinPath(listParentPath, entry.name))
        } else {
          triggerFileHint()
        }
      }, ROW_CLICK_DELAY_MS)
    },
    [listParentPath, navigate, preview?.loading, triggerFileHint]
  )
  const handleRowDoubleClick = useCallback(
    (entry: DirEntry): void => {
      if (!entry.isDirectory || preview?.loading) {
        return
      }
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
      }
      onSelect(joinPath(listParentPath, entry.name))
    },
    [listParentPath, onSelect, preview?.loading]
  )
  const handleFilterKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Enter') {
        const action = decideEnterAction(preview ? previewEntries : filteredEntries)
        event.preventDefault()
        if (preview?.error || preview?.loading) {
          return
        }
        const parsed = parsePathInput(filter)
        if (preview && parsed.mode === 'path' && parsed.trailingFilter === '') {
          navigate(preview.resolvedPath)
        } else if (action.type === 'navigate') {
          const basePath = preview?.resolvedPath ?? resolvedPath
          navigate(joinPath(basePath, action.name))
        } else if (action.type === 'fileHint') {
          triggerFileHint()
        }
        return
      }
      if (event.key === 'Escape') {
        const action = decideEscAction(filter)
        if (action.type === 'clearFilter') {
          event.stopPropagation()
          event.preventDefault()
          resetInput()
          clearFileHint()
        } else {
          onCancel()
        }
        return
      }
      if (event.key === 'Backspace' && filter === '' && !preview && resolvedPath !== '/') {
        event.preventDefault()
        navigateUp()
      }
    },
    [
      clearFileHint,
      filter,
      filteredEntries,
      navigate,
      navigateUp,
      onCancel,
      preview,
      previewEntries,
      resetInput,
      resolvedPath,
      triggerFileHint
    ]
  )

  useEffect(() => {
    return () => {
      for (const timerRef of [fileHintTimerRef, clickTimerRef]) {
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
      }
    }
  }, [])

  const isPreviewActive = preview !== null
  const displayEntries = isPreviewActive ? previewEntries : filteredEntries
  const displayEmptyDirectory = isPreviewActive
    ? translate(
        'auto.components.sidebar.RemoteFileBrowser.previewEmptyDirectory',
        '{{value0}} is empty',
        { value0: preview.resolvedPath }
      )
    : translate('auto.components.sidebar.RemoteFileBrowser.51001182e3', 'Empty directory')
  const noMatchesFilter = preview?.filter ?? filter
  const displayNoMatches = isRemoteFileBrowserPathResolveTextTooLarge(noMatchesFilter)
    ? translate(
        'auto.components.sidebar.RemoteFileBrowser.largeInputNoMatches',
        'No matches for this long input'
      )
    : translate(
        'auto.components.sidebar.RemoteFileBrowser.00c4235c10',
        "No matches for '{{value0}}'",
        { value0: noMatchesFilter }
      )
  const selectDisabled = loading || (isPreviewActive && filter !== '')

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <RemoteFileBrowserBreadcrumbs
        disabled={loading}
        onNavigate={navigate}
        onNavigateUp={navigateUp}
        resolvedPath={resolvedPath}
      />
      <RemoteFileBrowserInput
        inputRef={inputRef}
        onChange={handleInputChange}
        onKeyDown={handleFilterKeyDown}
        onPaste={handleInputPaste}
        preview={preview}
        value={filter}
      />
      <RemoteFileBrowserList
        displayEmptyDirectory={displayEmptyDirectory}
        displayEntries={displayEntries}
        displayNoMatches={displayNoMatches}
        entries={entries}
        error={error}
        inputRef={inputRef}
        loading={loading}
        onRowClick={handleRowClick}
        onRowDoubleClick={handleRowDoubleClick}
        preview={preview}
      />
      <p
        className="text-muted-foreground block w-full truncate text-[10px]"
        title={fileHint ? undefined : resolvedPath}
      >
        {fileHint
          ? translate(
              'auto.components.sidebar.RemoteFileBrowser.fileHint',
              "Files can't be opened as a project"
            )
          : translate(
              'auto.components.sidebar.RemoteFileBrowser.971d85cc84',
              'Opens as a project on this host · {{value0}}',
              { value0: resolvedPath }
            )}
      </p>
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>
          {translate('auto.components.sidebar.RemoteFileBrowser.f8b1deb1a4', 'Cancel')}
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => onSelect(resolvedPath)}
          disabled={selectDisabled}
          title={resolvedPath}
        >
          {translate('auto.components.sidebar.RemoteFileBrowser.9e060f5815', 'Select folder')}
        </Button>
      </div>
    </div>
  )
}
