import type { SourceControlActionError } from './source-control-action-error'

export type RunRemoteActionResult =
  | { status: 'ok' }
  | { status: 'failed'; error: SourceControlActionError }
  | { status: 'superseded' }
  | { status: 'skipped' }
