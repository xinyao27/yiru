import type React from 'react'
import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import type {
  SpoolFileDiffResult,
  SpoolFileReadResult,
  SpoolFileTreeEntry
} from '../../../../shared/spool/spool-operation-contract'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SpoolFilePreviewToolbar, type SpoolFilePreviewMode } from './SpoolFilePreviewToolbar'

export function SpoolFilePreview({
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
  file: SpoolFileReadResult | null
  fileEntry: SpoolFileTreeEntry | null
  fileUnavailable: boolean
  loading: boolean
  saving: boolean
  supportsDiff: boolean
  diff: SpoolFileDiffResult | null
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
  const [mode, setMode] = useState<SpoolFilePreviewMode>('content')

  if (loading) {
    return (
      <FilePreviewMessage
        message={translate('auto.components.spool.SpoolFilePreview.loading', 'Loading file…')}
        onBack={onBack}
      />
    )
  }
  if (fileUnavailable) {
    return (
      <FilePreviewMessage
        message={translate(
          'auto.components.spool.SpoolFilePreview.fileUnavailable',
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
          'auto.components.spool.SpoolFilePreview.selectFile',
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
  const changeMode = (nextMode: SpoolFilePreviewMode): void => {
    setMode(nextMode)
    if (nextMode !== 'content') {
      onLoadDiff(nextMode === 'staged-diff')
    }
  }
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--editor-surface)]">
      <SpoolFilePreviewToolbar
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
  file: SpoolFileReadResult
  onDraftChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {file.offset > 0 || file.truncated ? (
        <FileNotice
          message={translate(
            'auto.components.spool.SpoolFilePreview.truncatedFile',
            'This is one chunk of the file. Editing is disabled to avoid replacing the full file with partial content.'
          )}
        />
      ) : null}
      <textarea
        value={draft}
        readOnly={!editable}
        spellCheck={false}
        aria-label={translate('auto.components.spool.SpoolFilePreview.editorLabel', 'File content')}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        className={cn(
          'scrollbar-editor min-h-0 flex-1 resize-none bg-[var(--editor-surface)] font-mono text-xs leading-5 text-foreground outline-none',
          'p-3',
          'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
          !editable && 'cursor-default'
        )}
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
  diff: SpoolFileDiffResult | null
  expectedStaged: boolean
  loading: boolean
  unavailable: boolean
}): React.JSX.Element {
  if (loading) {
    return (
      <FilePreviewMessage
        message={translate('auto.components.spool.SpoolFilePreview.loadingDiff', 'Loading diff…')}
      />
    )
  }
  if (unavailable || !diff || diff.staged !== expectedStaged) {
    return (
      <FilePreviewMessage
        message={translate(
          'auto.components.spool.SpoolFilePreview.diffUnavailable',
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
            'auto.components.spool.SpoolFilePreview.truncatedDiff',
            'This diff is truncated.'
          )}
        />
      ) : null}
      {diff.patch ? (
        <pre className="min-w-max whitespace-pre p-3 font-mono text-xs leading-5 text-foreground">
          {diff.patch}
        </pre>
      ) : (
        <FilePreviewMessage
          message={translate(
            'auto.components.spool.SpoolFilePreview.noDiff',
            'No diff for this file.'
          )}
        />
      )}
    </div>
  )
}

function BinaryProjection({ file }: { file: SpoolFileReadResult }): React.JSX.Element {
  return (
    <div className="scrollbar-editor min-h-0 flex-1 overflow-auto p-3">
      <FileNotice
        message={translate(
          'auto.components.spool.SpoolFilePreview.binaryDescription',
          'Binary preview · {{value0}} of {{value1}} bytes',
          { value0: file.bytesRead, value1: file.totalBytes }
        )}
      />
      <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-5 text-foreground">
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
      'auto.components.spool.SpoolFilePreview.binaryUnavailable',
      'Binary preview unavailable.'
    )
  }
}

function FileNotice({ message }: { message: string }): React.JSX.Element {
  return (
    <p className="border-b border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
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
        <header className="flex h-9 shrink-0 items-center border-b border-border bg-sidebar px-1.5 text-sidebar-foreground">
          <Button type="button" size="xs" variant="ghost" onClick={onBack}>
            <ChevronLeft aria-hidden="true" />
            {translate('auto.components.spool.SpoolFilePreview.back', 'Back to files')}
          </Button>
        </header>
      ) : null}
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
        {message}
      </div>
    </div>
  )
}
