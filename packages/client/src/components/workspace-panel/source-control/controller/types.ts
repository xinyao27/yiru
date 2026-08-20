import type { SourceControlActionError } from '../action-error'

export type RunRemoteActionResult =
  | { status: 'ok' }
  | { status: 'failed'; error: SourceControlActionError }
  | { status: 'superseded' }
  | { status: 'skipped' }
