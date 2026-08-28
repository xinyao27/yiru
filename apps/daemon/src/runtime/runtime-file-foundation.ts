import { constants } from 'node:fs/promises'

import { basenameFromRelativePath } from './runtime-file-paths'

export const MOBILE_FILE_LIST_LIMIT = 5000
export const MOBILE_FILE_PATH_SEARCH_CACHE_LIMIT = 20_000
export const MOBILE_FILE_PATH_SEARCH_CACHE_ENTRIES = 8
export const MOBILE_FILE_PATH_SEARCH_CACHE_TTL_MS = 30_000
export const MOBILE_FILE_READ_MAX_BYTES = 512 * 1024
export const RUNTIME_PREVIEWABLE_BINARY_MAX_BYTES = 10 * 1024 * 1024
export const WINDOWS_RUNTIME_FILE_WATCH_DEBOUNCE_MS = 150
export const WINDOWS_RUNTIME_FILE_WATCH_CLOSE_DEADLINE_MS = 10_000
export const TERMINAL_FILE_GRANT_TTL_MS = 10 * 60 * 1000
export const OPEN_NOFOLLOW = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
// Why: runtime files.watch subscriptions are cleaned up through synchronous RPC
// callbacks. Track native Parcel unsubscribe work so app shutdown can drain it.
export const pendingRuntimeFileWatcherUnsubscribes = new Set<Promise<void>>()
export type RuntimeFileWatcherLease = {
  suspend(): Promise<void>
  resume(): Promise<void>
  forget(): void
}
export const runtimeFileWatcherLeasesByOwnerAndRoot = new Map<
  string,
  Set<RuntimeFileWatcherLease>
>()
export const MOBILE_BINARY_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.pdf',
  '.png',
  '.webp',
  '.zip'
])
// Raster image extensions the mobile client can render from a base64 data URI
// via files.readPreview. Mirrors mobile's classifyMobileArtifact image set;
// SVG/PDF are intentionally excluded (RN <Image> can't decode those data URIs).
export const MOBILE_PREVIEWABLE_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico'
])

export type RuntimeFileStatLike = {
  size?: number
  dev?: number
  ino?: number
  nlink?: number
  mtime?: number | Date
  mtimeMs?: number
  isDirectory?: () => boolean
}

export type TerminalFileGrant = {
  id: string
  worktreeId: string
  absolutePath: string
  provider: 'local'
  clientId?: string
  expiresAt: number
  statIdentity: string | null
  expiryTimer?: ReturnType<typeof setTimeout>
}

export function isMobilePreviewableImagePath(relativePath: string): boolean {
  const basename = basenameFromRelativePath(relativePath)
  const dotIndex = basename.lastIndexOf('.')
  if (dotIndex <= 0) {
    return false
  }
  return MOBILE_PREVIEWABLE_IMAGE_EXTENSIONS.has(basename.slice(dotIndex).toLowerCase())
}

export const RUNTIME_PREVIEWABLE_BINARY_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
}
