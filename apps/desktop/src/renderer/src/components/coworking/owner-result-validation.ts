import { CoworkingChecksReadResultSchema } from '../../../../shared/coworking/checks-result-schema'
import {
  CoworkingFileDiffResultSchema,
  CoworkingFileListResultSchema,
  CoworkingFileReadResultSchema,
  CoworkingGitDiffResultSchema,
  CoworkingGitHistoryResultSchema,
  CoworkingGitStatusResultSchema,
  CoworkingMutationResultSchema,
  CoworkingTerminalCreateRequesterResultSchema,
  CoworkingTerminalLaunchOptionsResultSchema,
  type CoworkingTerminalCreateRequesterResult
} from '../../../../shared/coworking/execution-result-schema'
import type {
  CoworkingChecksReadResult,
  CoworkingFileDiffResult,
  CoworkingFileListResult,
  CoworkingFileReadResult,
  CoworkingGitDiffResult,
  CoworkingGitHistoryResult,
  CoworkingGitStatusResult,
  CoworkingMutationResult,
  CoworkingTerminalLaunchOptionsResult
} from '../../../../shared/coworking/operation-contract'

export type CoworkingTerminalCreateResult = CoworkingTerminalCreateRequesterResult

export function parseCoworkingFileListResult(value: unknown): CoworkingFileListResult {
  return CoworkingFileListResultSchema.parse(value)
}

export function parseCoworkingFileReadResult(value: unknown): CoworkingFileReadResult {
  return CoworkingFileReadResultSchema.parse(value)
}

export function parseCoworkingFileDiffResult(value: unknown): CoworkingFileDiffResult {
  return CoworkingFileDiffResultSchema.parse(value)
}

export function parseCoworkingGitStatusResult(value: unknown): CoworkingGitStatusResult {
  return CoworkingGitStatusResultSchema.parse(value)
}

export function parseCoworkingGitDiffResult(value: unknown): CoworkingGitDiffResult {
  return CoworkingGitDiffResultSchema.parse(value)
}

export function parseCoworkingGitHistoryResult(value: unknown): CoworkingGitHistoryResult {
  return CoworkingGitHistoryResultSchema.parse(value)
}

export function parseCoworkingChecksReadResult(value: unknown): CoworkingChecksReadResult {
  return CoworkingChecksReadResultSchema.parse(value)
}

export function parseCoworkingMutationResult(value: unknown): CoworkingMutationResult {
  return CoworkingMutationResultSchema.parse(value)
}

export function parseCoworkingTerminalLaunchOptionsResult(
  value: unknown
): CoworkingTerminalLaunchOptionsResult {
  return CoworkingTerminalLaunchOptionsResultSchema.parse(value)
}

export function parseCoworkingTerminalCreateResult(value: unknown): CoworkingTerminalCreateResult {
  return CoworkingTerminalCreateRequesterResultSchema.parse(value)
}
