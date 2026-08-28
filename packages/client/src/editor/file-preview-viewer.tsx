import React, { useEffect, useState } from 'react'
import { lazyWithRetry as lazy } from '~renderer/application-shell/lazy-with-retry'
import { translate } from '~renderer/i18n/i18n'
import { FileAudio } from '~renderer/icons/hugeicons'
import { getConnectionIdForFile } from '~renderer/runtime/connection-context'
import { readRuntimeFileBlob } from '~renderer/runtime/file-client'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'

import { FileLoadErrorView } from './content-foundation'
import type { FilePreview } from './file-preview-kind'
import type { OpenFile } from './state'

const ImageViewer = lazy(() => import('./image-viewer'))

type FilePreviewViewerProps = {
  file: OpenFile
  preview: FilePreview
}

type PreviewLoadState =
  | { status: 'loading' }
  | { status: 'ready'; url: string; byteLength: number }
  | { status: 'error'; message: string }

export default function FilePreviewViewer({
  file,
  preview
}: FilePreviewViewerProps): React.JSX.Element {
  const [attempt, setAttempt] = useState(0)

  return (
    <FilePreviewLoad
      key={`${file.filePath}\0${attempt}`}
      file={file}
      preview={preview}
      onRetry={() => setAttempt((current) => current + 1)}
    />
  )
}

function FilePreviewLoad({
  file,
  preview,
  onRetry
}: FilePreviewViewerProps & { onRetry: () => void }): React.JSX.Element {
  const [loadState, setLoadState] = useState<PreviewLoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    const state = useAppStore.getState()
    const settings = settingsForRuntimeOwner(state.settings, file.runtimeEnvironmentId)
    const connectionId = getConnectionIdForFile(file.worktreeId, file.filePath) ?? undefined

    readRuntimeFileBlob(
      {
        settings,
        filePath: file.filePath,
        relativePath: file.relativePath,
        worktreeId: file.worktreeId,
        connectionId
      },
      preview.mimeType
    )
      .then(({ blob, byteLength }) => {
        const url = URL.createObjectURL(blob)
        objectUrl = url
        if (cancelled) {
          URL.revokeObjectURL(url)
          objectUrl = null
          return
        }
        setLoadState({ status: 'ready', url, byteLength })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadState({ status: 'error', message: previewLoadErrorMessage(error) })
        }
      })

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [
    file.filePath,
    file.relativePath,
    file.runtimeEnvironmentId,
    file.worktreeId,
    preview.mimeType
  ])

  if (loadState.status === 'loading') {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {translate('auto.components.editor.FilePreviewViewer.loading', 'Loading preview...')}
      </div>
    )
  }
  if (loadState.status === 'error') {
    return <FileLoadErrorView message={loadState.message} onRetry={onRetry} />
  }
  if (preview.kind === 'image' || preview.kind === 'pdf') {
    return (
      <ImageViewer
        filePath={file.filePath}
        mimeType={preview.mimeType}
        src={loadState.url}
        byteLength={loadState.byteLength}
      />
    )
  }
  return (
    <MediaPreview
      filePath={file.filePath}
      kind={preview.kind}
      mimeType={preview.mimeType}
      src={loadState.url}
      byteLength={loadState.byteLength}
      onRetry={onRetry}
    />
  )
}

function MediaPreview({
  filePath,
  kind,
  mimeType,
  src,
  byteLength,
  onRetry
}: {
  filePath: string
  kind: 'audio' | 'video'
  mimeType: string
  src: string
  byteLength: number
  onRetry: () => void
}): React.JSX.Element {
  const [hasPlaybackError, setHasPlaybackError] = useState(false)
  const filename = filePath.split(/[/\\]/).pop() ?? filePath
  if (hasPlaybackError) {
    return (
      <FileLoadErrorView
        message={translate(
          'auto.components.editor.FilePreviewViewer.unsupportedCodec',
          "This file's media codec isn't supported by the built-in player."
        )}
        onRetry={onRetry}
      />
    )
  }

  if (kind === 'video') {
    return (
      <div className="bg-background flex h-full min-h-0 items-center justify-center p-4">
        <video
          aria-label={filename}
          className="max-h-full max-w-full"
          controls
          onError={() => setHasPlaybackError(true)}
          preload="metadata"
        >
          <source src={src} type={mimeType} />
        </video>
      </div>
    )
  }

  return (
    <div className="bg-muted/20 text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-8 text-sm">
      <FileAudio className="size-10" />
      <div className="text-foreground max-w-xl truncate font-medium" title={filename}>
        {filename}
      </div>
      <div className="text-xs">{formatFileSize(byteLength)}</div>
      <audio
        aria-label={filename}
        className="w-full max-w-xl"
        controls
        onError={() => setHasPlaybackError(true)}
        preload="metadata"
      >
        <source src={src} type={mimeType} />
      </audio>
    </div>
  )
}

function previewLoadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message === 'file_preview_too_large') {
    return translate(
      'auto.components.editor.FilePreviewViewer.tooLarge',
      'File is too large to preview (512 MB limit).'
    )
  }
  if (message === 'file_preview_stalled') {
    return translate(
      'auto.components.editor.FilePreviewViewer.stalled',
      'File preview stopped loading before it was complete.'
    )
  }
  if (message === 'remote_file_outside_owner') {
    return translate(
      'auto.components.editor.FilePreviewViewer.outsideRuntime',
      'Remote file is outside the owning runtime worktree.'
    )
  }
  return message
}

function formatFileSize(byteLength: number): string {
  if (byteLength < 1024) {
    return translate('auto.components.editor.FilePreviewViewer.bytes', '{{value0}} B', {
      value0: byteLength
    })
  }
  if (byteLength < 1024 * 1024) {
    return translate('auto.components.editor.FilePreviewViewer.kilobytes', '{{value0}} KB', {
      value0: (byteLength / 1024).toFixed(1)
    })
  }
  return translate('auto.components.editor.FilePreviewViewer.megabytes', '{{value0}} MB', {
    value0: (byteLength / (1024 * 1024)).toFixed(1)
  })
}
