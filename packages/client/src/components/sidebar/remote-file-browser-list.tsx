import type { RefObject } from 'react'
import { CaretRight as ChevronRight, Folder } from '~renderer/components/icons/hugeicons'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'
import { getFileTypeIcon } from '~renderer/lib/file-type-icons'

import type { DirEntry } from './remote-file-browser-state'
import type { RemotePathPreview } from './use-remote-path-preview'

type RemoteFileBrowserListProps = {
  displayEmptyDirectory: string
  displayEntries: DirEntry[]
  displayNoMatches: string
  entries: DirEntry[]
  error: string | null
  inputRef: RefObject<HTMLInputElement | null>
  loading: boolean
  onRowClick: (entry: DirEntry) => void
  onRowDoubleClick: (entry: DirEntry) => void
  preview: RemotePathPreview | null
}

export function RemoteFileBrowserList({
  displayEmptyDirectory,
  displayEntries,
  displayNoMatches,
  entries,
  error,
  inputRef,
  loading,
  onRowClick,
  onRowDoubleClick,
  preview
}: RemoteFileBrowserListProps): React.JSX.Element {
  const isPreviewActive = preview !== null
  const isPreviewEmpty =
    isPreviewActive && preview.entries.length === 0 && !preview.error && !preview.loading

  return (
    <div className="border-border bg-background overflow-hidden border">
      <div className="scrollbar-sleek h-[240px] overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingIndicator className="text-muted-foreground size-5" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-destructive text-center text-xs">{error}</p>
          </div>
        ) : isPreviewEmpty ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-xs">{displayEmptyDirectory}</p>
          </div>
        ) : !isPreviewActive && entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-xs">
              {translate('auto.components.sidebar.RemoteFileBrowser.51001182e3', 'Empty directory')}
            </p>
          </div>
        ) : displayEntries.length === 0 && !preview?.error ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-xs">{displayNoMatches}</p>
          </div>
        ) : (
          displayEntries.map((entry) => {
            const FileIcon = getFileTypeIcon(entry.name)
            return (
              <Button
                variant="ghost"
                size="sm"
                key={entry.name}
                type="button"
                onClick={() => onRowClick(entry)}
                onDoubleClick={() => onRowDoubleClick(entry)}
                onMouseDown={(event) => {
                  event.preventDefault()
                  inputRef.current?.focus()
                }}
                className={cn(
                  'border-0 justify-start whitespace-normal font-normal gap-2 focus-visible:bg-accent/60',
                  'w-full flex py-1.5 text-xs text-left transition-colors',
                  'hover:bg-accent/60'
                )}
              >
                {entry.isDirectory ? (
                  <Folder className="text-muted-foreground size-3.5 shrink-0" />
                ) : (
                  <FileIcon className="text-muted-foreground/60 size-3.5 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                {entry.isDirectory && (
                  <ChevronRight className="text-muted-foreground/60 size-3.5 shrink-0" />
                )}
              </Button>
            )
          })
        )}
      </div>
    </div>
  )
}
