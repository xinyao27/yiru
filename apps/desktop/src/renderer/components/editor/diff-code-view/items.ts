import { parseDiffFromFile, type FileContents, type FileDiffMetadata } from '@pierre/diffs'
import type { GitFileStatus } from '@yiru/workbench-model/review'

import { resolvePierreDiffLanguage } from '../pierre-diff-language'

/** One changed file, in the shape our git layer already produces. */
export type DiffCodeViewSource = {
  /** Stable identity for the row across reloads — becomes the CodeView item id. */
  key: string
  path: string
  /** Pre-rename path, when git reported one. */
  oldPath?: string
  status: GitFileStatus | string
  originalContent: string
  modifiedContent: string
  /** Editor-side language id, used only when the filename infers nothing. */
  language?: string
  /** Bumped when refetched content replaces what a cache key already covered. */
  contentGeneration?: number
}

// Why: git reports the two sides of a change through the status, not through
// empty content — an added file and a file emptied to zero bytes both carry an
// empty original. Pierre distinguishes them by which side is null, so the
// status is what decides, never the string length.
const ADDED_STATUSES: ReadonlySet<string> = new Set(['added', 'untracked'])

function buildFileContents(
  name: string,
  contents: string,
  cacheKey: string,
  language: string | undefined,
  path: string
): FileContents {
  const resolvedLanguage = language ? resolvePierreDiffLanguage(path, language) : undefined
  return resolvedLanguage
    ? { name, contents, cacheKey, lang: resolvedLanguage }
    : { name, contents, cacheKey }
}

/**
 * Parses one changed file into the diff metadata a CodeView item carries.
 *
 * Pierre resolves the change type from which side is null and from the two
 * names, so pure renames and empty additions come back as `rename-pure`/`new`
 * with no hunks rather than as errors. Returns null only if parsing genuinely
 * fails, so a single unreadable file cannot take the whole list down.
 */
export function buildDiffCodeViewFileDiff(source: DiffCodeViewSource): FileDiffMetadata | null {
  const isAdded = ADDED_STATUSES.has(source.status)
  const isDeleted = source.status === 'deleted'
  const previousPath = source.oldPath ?? source.path
  const generation = source.contentGeneration ?? 0
  const oldFile = isAdded
    ? null
    : buildFileContents(
        previousPath,
        source.originalContent,
        `${source.key}:${generation}:old`,
        source.language,
        previousPath
      )
  const newFile = isDeleted
    ? null
    : buildFileContents(
        source.path,
        source.modifiedContent,
        `${source.key}:${generation}:new`,
        source.language,
        source.path
      )
  try {
    return parseDiffFromFile(oldFile, newFile)
  } catch (error) {
    console.warn('[DiffCodeView] failed to parse diff', source.path, error)
    return null
  }
}
