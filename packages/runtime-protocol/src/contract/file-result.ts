import type { RuntimeTerminalPathResolution } from '../mobile-runtime-types.js'

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

export type RuntimeDirectoryEntry = {
  name: string
  isDirectory: boolean
  isSymlink: boolean
}

export type RuntimeServerDirectoryResult = {
  resolvedPath: string
  entries: RuntimeDirectoryEntry[]
}

export type RuntimeFileMutationResult = { ok: true }

export type RuntimeSearchMatch = {
  line: number
  column: number
  matchLength: number
  lineContent: string
  displayColumn?: number
  displayMatchLength?: number
}

export type RuntimeSearchFileResult = {
  filePath: string
  relativePath: string
  matches: RuntimeSearchMatch[]
  matchCount?: number
}

export type RuntimeFileSearchResult = {
  files: RuntimeSearchFileResult[]
  totalMatches: number
  truncated: boolean
}

export type RuntimeMarkdownDocument = {
  filePath: string
  relativePath: string
  basename: string
  name: string
}

export type RuntimeFileStatResult = {
  size: number
  isDirectory: boolean
  mtime: number
}

export type RuntimeFileUnwatchResult = { unsubscribed: true }

export type RuntimeFileChangeEvent = {
  kind: 'create' | 'update' | 'delete' | 'rename' | 'overflow'
  absolutePath: string
  oldAbsolutePath?: string
  isDirectory?: boolean
}

export type RuntimeFileWatchEvent =
  | { type: 'starting'; subscriptionId: string }
  | { type: 'ready'; subscriptionId: string }
  | { type: 'changed'; worktree: string; events: RuntimeFileChangeEvent[] }
  | { type: 'error'; message: string }
  | { type: 'end' }

export type { RuntimeTerminalPathResolution }

// Live log tailing. The file is an absolute host path (AI-vault session logs),
// authorized on the host the same way the IPC path is, so these carry host
// access rather than a worktree grant.
export type RuntimeLogTailReadResult = {
  contentBase64: string
  nextByteOffset: number
  fileSize: number
  fileIdentity: string
  hasMore: boolean
  reset: boolean
}

export type RuntimeLogTailWatchEvent =
  | { type: 'ready'; subscriptionId: string }
  // `rename` signals rotation: the reader restarts from a fresh snapshot.
  | { type: 'changed'; eventType: 'change' | 'rename' }
  | { type: 'end' }
