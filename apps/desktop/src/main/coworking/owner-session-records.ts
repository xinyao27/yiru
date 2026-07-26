import { normalizeExecutionHostId } from '@yiru/workbench-model/workspace'

import type { CoworkingOwnerHistoricalSessionRecord } from './session-source'

const MAX_OWNER_RECORDS = 10_000
const MAX_TRANSCRIPT_PATH_LENGTH = 32_768
const MAX_RESUME_COMMAND_LENGTH = 128 * 1024
const MAX_TITLE_LENGTH = 2_048
const MAX_IDENTIFIER_LENGTH = 32_768
const MAX_PROVIDER_SESSION_ID_LENGTH = 512

/** Keeps execution locators owner-side while catalog entries expose only aliases. */
export class CoworkingOwnerSessionRecords {
  private readonly records = new Map<string, CoworkingOwnerHistoricalSessionRecord>()

  rememberResolved(record: CoworkingOwnerHistoricalSessionRecord): boolean {
    const accepted = normalizeOwnerHistoricalSessionRecord(record)
    if (!accepted) {
      return false
    }
    this.records.delete(accepted.ownerRecordKey)
    this.records.set(accepted.ownerRecordKey, accepted)
    while (this.records.size > MAX_OWNER_RECORDS) {
      const oldest = this.records.keys().next().value
      if (!oldest) {
        break
      }
      this.records.delete(oldest)
    }
    return true
  }

  forget(ownerRecordKey: string): void {
    this.records.delete(ownerRecordKey)
  }

  resolve(ownerRecordKey: string): CoworkingOwnerHistoricalSessionRecord | null {
    const record = this.records.get(ownerRecordKey)
    if (!record) {
      return null
    }
    this.records.delete(ownerRecordKey)
    this.records.set(ownerRecordKey, record)
    return { ...record }
  }
}

export function normalizeOwnerHistoricalSessionRecord(
  record: CoworkingOwnerHistoricalSessionRecord
): CoworkingOwnerHistoricalSessionRecord | null {
  const ownerRecordKey = boundedValue(record.ownerRecordKey, MAX_IDENTIFIER_LENGTH)
  const executionHostId = normalizeExecutionHostId(
    boundedValue(record.executionHostId, MAX_IDENTIFIER_LENGTH)
  )
  const actualHostScope = boundedValue(record.actualHostScope, MAX_IDENTIFIER_LENGTH)
  const worktreeInstanceId = boundedValue(record.worktreeInstanceId, MAX_IDENTIFIER_LENGTH)
  const coworkingIncarnationId = boundedValue(record.coworkingIncarnationId, MAX_IDENTIFIER_LENGTH)
  const providerSessionId = boundedValue(record.providerSessionId, MAX_PROVIDER_SESSION_ID_LENGTH)
  const transcriptPath = boundedValue(record.transcriptPath, MAX_TRANSCRIPT_PATH_LENGTH)
  const resumeCommand = boundedValue(record.resumeCommand, MAX_RESUME_COMMAND_LENGTH)
  const title = boundedValue(record.title, MAX_TITLE_LENGTH)
  if (
    !ownerRecordKey ||
    !executionHostId ||
    !actualHostScope ||
    !worktreeInstanceId ||
    !coworkingIncarnationId ||
    !providerSessionId ||
    !transcriptPath ||
    !resumeCommand ||
    !title
  ) {
    return null
  }
  return {
    ...record,
    ownerRecordKey,
    executionHostId,
    actualHostScope,
    worktreeInstanceId,
    coworkingIncarnationId,
    providerSessionId,
    transcriptPath,
    resumeCommand,
    title
  }
}

function boundedValue(value: string, maxLength: number): string | null {
  const trimmed = value.trim()
  return trimmed && trimmed.length <= maxLength && !trimmed.includes('\0') ? trimmed : null
}
