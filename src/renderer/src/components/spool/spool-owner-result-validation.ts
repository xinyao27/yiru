import type {
  SpoolChecksReadResult,
  SpoolFileDiffResult,
  SpoolFileListResult,
  SpoolFileReadResult,
  SpoolGitDiffResult,
  SpoolGitHistoryResult,
  SpoolGitStatusResult,
  SpoolMutationResult,
  SpoolTerminalLaunchOptionsResult
} from '../../../../shared/spool/spool-operation-contract'
import {
  SpoolFileDiffResultSchema,
  SpoolFileListResultSchema,
  SpoolFileReadResultSchema,
  SpoolGitDiffResultSchema,
  SpoolGitHistoryResultSchema,
  SpoolGitStatusResultSchema,
  SpoolMutationResultSchema,
  SpoolTerminalCreateRequesterResultSchema,
  SpoolTerminalLaunchOptionsResultSchema,
  type SpoolTerminalCreateRequesterResult
} from '../../../../shared/spool/spool-execution-result-schema'
import { SpoolChecksReadResultSchema } from '../../../../shared/spool/spool-checks-result-schema'

export type SpoolTerminalCreateResult = SpoolTerminalCreateRequesterResult

export function parseSpoolFileListResult(value: unknown): SpoolFileListResult {
  return SpoolFileListResultSchema.parse(value)
}

export function parseSpoolFileReadResult(value: unknown): SpoolFileReadResult {
  return SpoolFileReadResultSchema.parse(value)
}

export function parseSpoolFileDiffResult(value: unknown): SpoolFileDiffResult {
  return SpoolFileDiffResultSchema.parse(value)
}

export function parseSpoolGitStatusResult(value: unknown): SpoolGitStatusResult {
  return SpoolGitStatusResultSchema.parse(value)
}

export function parseSpoolGitDiffResult(value: unknown): SpoolGitDiffResult {
  return SpoolGitDiffResultSchema.parse(value)
}

export function parseSpoolGitHistoryResult(value: unknown): SpoolGitHistoryResult {
  return SpoolGitHistoryResultSchema.parse(value)
}

export function parseSpoolChecksReadResult(value: unknown): SpoolChecksReadResult {
  return SpoolChecksReadResultSchema.parse(value)
}

export function parseSpoolMutationResult(value: unknown): SpoolMutationResult {
  return SpoolMutationResultSchema.parse(value)
}

export function parseSpoolTerminalLaunchOptionsResult(
  value: unknown
): SpoolTerminalLaunchOptionsResult {
  return SpoolTerminalLaunchOptionsResultSchema.parse(value)
}

export function parseSpoolTerminalCreateResult(value: unknown): SpoolTerminalCreateResult {
  return SpoolTerminalCreateRequesterResultSchema.parse(value)
}
