import type React from 'react'
import { useEffect, useState } from 'react'
import { FileDiff, RefreshCw, Save, Trash2 } from 'lucide-react'
import type {
  SpoolFileDiffResult,
  SpoolFileReadResult,
  SpoolFileTreeEntry
} from '../../../../shared/spool/spool-operation-contract'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type FilePreviewMode = 'content' | 'working-diff' | 'staged-diff'

export function SpoolFilePreview({
  canControl,
  draft,
  file,
  fileEntry,
  fileUnavailable,
  loading,
  saving,
  diff,
  diffLoading,
  diffUnavailable,
  onDelete,
  onDraftChange,
  onLoadDiff,
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
  diff: SpoolFileDiffResult | null
  diffLoading: boolean
  diffUnavailable: boolean
  onDelete: () => void
  onDraftChange: (value: string) => void
  onLoadDiff: (staged: boolean) => void
  onRefresh: () => void
  onRename: () => void
  onSave: () => void
}): React.JSX.Element {
  const [mode, setMode] = useState<FilePreviewMode>('content')
  useEffect(() => setMode('content'), [file?.relativePath])

  if (loading) {
    return (
      <FilePreviewMessage
        message={translate('auto.components.spool.SpoolFilePreview.loading', 'Loading file…')}
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
      />
    )
  }

  const dirty = file.encoding === 'utf8' && draft !== file.content
  const editable = canControl && file.encoding === 'utf8' && !file.truncated
  const showDiff = mode !== 'content'
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--editor-surface)]">
      <header className="flex min-h-9 shrink-0 flex-wrap items-center gap-1 border-b border-border bg-card px-2 py-1">
        <span className="min-w-28 flex-1 truncate px-1 font-mono text-xs text-foreground">
          {file.relativePath}
        </span>
        <Button type="button" size="xs" variant="ghost" onClick={onRefresh}>
          <RefreshCw aria-hidden="true" />
          {translate('auto.components.spool.SpoolFilePreview.reload', 'Reload')}
        </Button>
        <Button
          type="button"
          size="xs"
          variant={mode === 'working-diff' ? 'secondary' : 'ghost'}
          onClick={() => {
            setMode('working-diff')
            onLoadDiff(false)
          }}
        >
          <FileDiff aria-hidden="true" />
          {translate('auto.components.spool.SpoolFilePreview.workingDiff', 'Working diff')}
        </Button>
        <Button
          type="button"
          size="xs"
          variant={mode === 'staged-diff' ? 'secondary' : 'ghost'}
          onClick={() => {
            setMode('staged-diff')
            onLoadDiff(true)
          }}
        >
          {translate('auto.components.spool.SpoolFilePreview.stagedDiff', 'Staged diff')}
        </Button>
        {showDiff ? (
          <Button type="button" size="xs" variant="ghost" onClick={() => setMode('content')}>
            {translate('auto.components.spool.SpoolFilePreview.content', 'Content')}
          </Button>
        ) : null}
        <Button type="button" size="xs" variant="ghost" disabled={!canControl} onClick={onRename}>
          {translate('auto.components.spool.SpoolFilePreview.rename', 'Rename')}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={!canControl}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" />
          {translate('auto.components.spool.SpoolFilePreview.delete', 'Delete')}
        </Button>
        {!showDiff && file.encoding === 'utf8' ? (
          <Button type="button" size="xs" disabled={!editable || !dirty || saving} onClick={onSave}>
            <Save aria-hidden="true" />
            {saving
              ? translate('auto.components.spool.SpoolFilePreview.saving', 'Saving…')
              : translate('auto.components.spool.SpoolFilePreview.save', 'Save')}
          </Button>
        ) : null}
      </header>
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
      {file.truncated ? (
        <FileNotice
          message={translate(
            'auto.components.spool.SpoolFilePreview.truncatedFile',
            'This preview is truncated. Editing is disabled to avoid replacing the full file with partial content.'
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
          'scrollbar-editor min-h-0 flex-1 resize-none bg-[var(--editor-surface)] p-4 font-mono text-xs leading-5 text-foreground outline-none',
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
        <pre className="min-w-max whitespace-pre p-4 font-mono text-xs leading-5 text-foreground">
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
    <div className="scrollbar-editor min-h-0 flex-1 overflow-auto p-4">
      <FileNotice
        message={translate(
          'auto.components.spool.SpoolFilePreview.binaryDescription',
          'Binary preview · {{value0}} of {{value1}} bytes',
          { value0: file.bytesRead, value1: file.totalBytes }
        )}
      />
      <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-5 text-foreground">
        {projectBase64AsHex(file.content)}
      </pre>
    </div>
  )
}

function projectBase64AsHex(content: string): string {
  try {
    const bytes = Uint8Array.from(atob(content), (character) => character.charCodeAt(0)).slice(
      0,
      4096
    )
    const rows: string[] = []
    for (let offset = 0; offset < bytes.length; offset += 16) {
      const row = bytes.slice(offset, offset + 16)
      const address = offset.toString(16).padStart(8, '0')
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

function FilePreviewMessage({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
      {message}
    </div>
  )
}
