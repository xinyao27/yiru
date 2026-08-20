import type React from 'react'
import { useState } from 'react'
import { CaretLeft as ChevronLeft } from '~renderer/components/icons/hugeicons'
import { Button } from '~renderer/components/ui/button'
import { Textarea } from '~renderer/components/ui/textarea'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'
import type {
  CoworkingFileDiffResult,
  CoworkingFileReadResult,
  CoworkingFileTreeEntry
} from '~shared/coworking/operation-contract'

import { CoworkingFilePreviewToolbar, type CoworkingFilePreviewMode } from './file-preview-toolbar'

export function CoworkingFilePreview({
  canControl,
  draft,
  file,
  fileEntry,
  fileUnavailable,
  loading,
  saving,
  supportsDiff,
  diff,
  diffLoading,
  diffUnavailable,
  onDelete,
  onBack,
  onDraftChange,
  onLoadDiff,
  onNextChunk,
  onPreviousChunk,
  onRefresh,
  onRename,
  onSave
}: {
  canControl: boolean
  draft: string
  file: CoworkingFileReadResult | null
  fileEntry: CoworkingFileTreeEntry | null
  fileUnavailable: boolean
  loading: boolean
  saving: boolean
  supportsDiff: boolean
  diff: CoworkingFileDiffResult | null
  diffLoading: boolean
  diffUnavailable: boolean
  onDelete: () => void
  onBack: () => void
  onDraftChange: (value: string) => void
  onLoadDiff: (staged: boolean) => void
  onNextChunk: () => void
  onPreviousChunk: () => void
  onRefresh: () => void
  onRename: () => void
  onSave: () => void
}): React.JSX.Element {
  const [mode, setMode] = useState<CoworkingFilePreviewMode>('content')

  if (loading) {
    return (
      <FilePreviewMessage
        message={translate(
          'auto.components.coworking.CoworkingFilePreview.loading',
          'Loading file…'
        )}
        onBack={onBack}
      />
    )
  }
  if (fileUnavailable) {
    return (
      <FilePreviewMessage
        message={translate(
          'auto.components.coworking.CoworkingFilePreview.fileUnavailable',
          'This file is unavailable.'
        )}
        onBack={onBack}
      />
    )
  }
  if (!file || !fileEntry) {
    return (
      <FilePreviewMessage
        message={translate(
          'auto.components.coworking.CoworkingFilePreview.selectFile',
          'Select a file to inspect it.'
        )}
        onBack={onBack}
      />
    )
  }

  const dirty = file.encoding === 'utf8' && draft !== file.content
  const completeFile = file.offset === 0 && file.bytesRead === file.totalBytes
  const editable = canControl && file.encoding === 'utf8' && completeFile
  const showDiff = supportsDiff && mode !== 'content'
  const changeMode = (nextMode: CoworkingFilePreviewMode): void => {
    setMode(nextMode)
    if (nextMode !== 'content') {
      onLoadDiff(nextMode === 'staged-diff')
    }
  }
  return (
    <section className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
      <CoworkingFilePreviewToolbar
        canControl={canControl}
        dirty={dirty}
        editable={editable}
        file={file}
        mode={mode}
        onBack={onBack}
        onDelete={onDelete}
        onModeChange={changeMode}
        onNextChunk={onNextChunk}
        onPreviousChunk={onPreviousChunk}
        onRefresh={onRefresh}
        onRename={onRename}
        onSave={onSave}
        saving={saving}
        supportsDiff={supportsDiff}
      />
      {showDiff ? (
        <DiffProjection
          diff={diff}
          loading={diffLoading}
          unavailable={diffUnavailable}
          expectedStaged={mode === 'staged-diff'}
        />
      ) : file.encoding === 'utf8' ? (
        <TextProjection
          file={file}
          draft={draft}
          editable={editable}
          onDraftChange={onDraftChange}
        />
      ) : (
        <BinaryProjection file={file} />
      )}
    </section>
  )
}

function TextProjection({
  draft,
  editable,
  file,
  onDraftChange
}: {
  draft: string
  editable: boolean
  file: CoworkingFileReadResult
  onDraftChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {file.offset > 0 || file.truncated ? (
        <FileNotice
          message={translate(
            'auto.components.coworking.CoworkingFilePreview.truncatedFile',
            'This is one chunk of the file. Editing is disabled to avoid replacing the full file with partial content.'
          )}
        />
      ) : null}
      <Textarea
        variant="editor"
        value={draft}
        readOnly={!editable}
        spellCheck={false}
        aria-label={translate(
          'auto.components.coworking.CoworkingFilePreview.editorLabel',
          'File content'
        )}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        className={cn('flex-1', !editable && 'cursor-default')}
      />
    </div>
  )
}

function DiffProjection({
  diff,
  expectedStaged,
  loading,
  unavailable
}: {
  diff: CoworkingFileDiffResult | null
  expectedStaged: boolean
  loading: boolean
  unavailable: boolean
}): React.JSX.Element {
  if (loading) {
    return (
      <FilePreviewMessage
        message={translate(
          'auto.components.coworking.CoworkingFilePreview.loadingDiff',
          'Loading diff…'
        )}
      />
    )
  }
  if (unavailable || !diff || diff.staged !== expectedStaged) {
    return (
      <FilePreviewMessage
        message={translate(
          'auto.components.coworking.CoworkingFilePreview.diffUnavailable',
          'This diff is unavailable.'
        )}
      />
    )
  }
  return (
    <div className="scrollbar-editor min-h-0 flex-1 overflow-auto">
      {diff.truncated ? (
        <FileNotice
          message={translate(
            'auto.components.coworking.CoworkingFilePreview.truncatedDiff',
            'This diff is truncated.'
          )}
        />
      ) : null}
      {diff.patch ? (
        <pre className="text-foreground min-w-max p-3 font-mono text-xs leading-5 whitespace-pre">
          {diff.patch}
        </pre>
      ) : (
        <FilePreviewMessage
          message={translate(
            'auto.components.coworking.CoworkingFilePreview.noDiff',
            'No diff for this file.'
          )}
        />
      )}
    </div>
  )
}

function BinaryProjection({ file }: { file: CoworkingFileReadResult }): React.JSX.Element {
  return (
    <div className="scrollbar-editor min-h-0 flex-1 overflow-auto p-3">
      <FileNotice
        message={translate(
          'auto.components.coworking.CoworkingFilePreview.binaryDescription',
          'Binary preview · {{value0}} of {{value1}} bytes',
          { value0: file.bytesRead, value1: file.totalBytes }
        )}
      />
      <pre className="text-foreground mt-3 font-mono text-xs leading-5 whitespace-pre-wrap">
        {projectBase64AsHex(file.content, file.offset)}
      </pre>
    </div>
  )
}

function projectBase64AsHex(content: string, baseOffset: number): string {
  try {
    const bytes = Uint8Array.from(atob(content), (character) => character.charCodeAt(0)).slice(
      0,
      4096
    )
    const rows: string[] = []
    for (let offset = 0; offset < bytes.length; offset += 16) {
      const row = bytes.slice(offset, offset + 16)
      const address = (baseOffset + offset).toString(16).padStart(8, '0')
      const hex = [...row].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
      const ascii = [...row]
        .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'))
        .join('')
      rows.push(`${address}  ${hex.padEnd(47)}  ${ascii}`)
    }
    return rows.join('\n')
  } catch {
    return translate(
      'auto.components.coworking.CoworkingFilePreview.binaryUnavailable',
      'Binary preview unavailable.'
    )
  }
}

function FileNotice({ message }: { message: string }): React.JSX.Element {
  return (
    <p className="border-border bg-muted/50 text-muted-foreground border-b px-3 py-2 text-xs">
      {message}
    </p>
  )
}

function FilePreviewMessage({
  message,
  onBack
}: {
  message: string
  onBack?: () => void
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {onBack ? (
        <header className="border-border bg-sidebar text-sidebar-foreground flex h-9 shrink-0 items-center border-b px-1.5">
          <Button type="button" size="xs" variant="ghost" onClick={onBack}>
            <ChevronLeft aria-hidden="true" />
            {translate('auto.components.coworking.CoworkingFilePreview.back', 'Back to files')}
          </Button>
        </header>
      ) : null}
      <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center p-6 text-xs">
        {message}
      </div>
    </div>
  )
}
