/**
 * Shared, pure text-search helpers used by both the local main process and the
 * SSH relay. No child-process or filesystem access belongs here.
 *
 * Why: both runtime paths must share argument construction, output parsing,
 * result limits, and relative-path normalization so their behavior cannot
 * drift. The backend-specific policy lives in the adjacent named modules.
 */
export {
  createAccumulator,
  DEFAULT_SEARCH_MAX_RESULTS,
  finalize,
  MAX_LINE_CONTENT_LENGTH,
  MAX_MATCHES_PER_FILE,
  normalizeRelativePath,
  SEARCH_TIMEOUT_MS
} from './core'
export type { SearchAccumulator, SearchOptionsLike } from './core'
export {
  buildGitGrepArgs,
  buildSubmatchRegex,
  ingestGitGrepLine,
  toGitGlobPathspec
} from './git-grep'
export { buildRgArgs, ingestRgJsonLine, splitSearchGlobPatterns } from './ripgrep'
