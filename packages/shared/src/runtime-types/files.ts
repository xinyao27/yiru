import type * as RuntimeMobileTypes from '@yiru/runtime-protocol/mobile-runtime-types'

import type {
  RuntimeMarkdownReadTabResult,
  RuntimeMarkdownSaveTabResult
} from '../mobile-markdown-document'

export type { RuntimeMarkdownReadTabResult, RuntimeMarkdownSaveTabResult }

export type RuntimeFileListEntry = {
  relativePath: string
  basename: string
  kind: 'text' | 'binary'
}

export type RuntimeFileListResult = {
  worktree: string
  rootPath: string
  files: RuntimeFileListEntry[]
  totalCount: number
  truncated: boolean
}

export type RuntimeFileOpenResult = {
  worktree: string
  relativePath: string
  kind: 'markdown' | 'text' | 'binary' | 'image'
  opened: boolean
}

export type RuntimeFileReadResult = {
  worktree: string
  relativePath: string
  content: string
  truncated: boolean
  byteLength: number
}

export type RuntimeTerminalPathOpenTarget = RuntimeMobileTypes.RuntimeTerminalPathOpenTarget
export type RuntimeTerminalPathResolution = RuntimeMobileTypes.RuntimeTerminalPathResolution

export type RuntimeFilePreviewResult = {
  content: string
  isBinary: boolean
  isImage?: boolean
  mimeType?: string
}

export type RuntimeFileReadChunkResult = {
  contentBase64: string
  bytesRead: number
  eof: boolean
}
