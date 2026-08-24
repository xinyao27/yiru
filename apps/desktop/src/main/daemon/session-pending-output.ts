import type { PendingOutputRecord } from './types'

const PENDING_OUTPUT_MAX_BYTES = 2 * 1024 * 1024
const PENDING_OUTPUT_SEGMENT_MAX_CHARS = 64 * 1024

export class SessionPendingOutput {
  private records: PendingOutputRecord[] = []
  private bytes = 0
  private overflowed = false
  private sequence = 0

  record(record: PendingOutputRecord): void {
    if (this.overflowed) {
      return
    }
    const bytes = record.kind === 'output' ? record.data.length : 8
    if (this.bytes + bytes > PENDING_OUTPUT_MAX_BYTES) {
      // Why: the next checkpoint falls back to a full snapshot, which
      // subsumes every incremental record discarded here.
      this.records = []
      this.bytes = 0
      this.overflowed = true
      return
    }
    const last = this.records.at(-1)
    if (
      record.kind === 'output' &&
      last?.kind === 'output' &&
      last.data.length < PENDING_OUTPUT_SEGMENT_MAX_CHARS
    ) {
      last.data += record.data
    } else {
      this.records.push(record)
    }
    this.bytes += bytes
  }

  drain(): { records: PendingOutputRecord[]; seq: number; overflowed: boolean } {
    const result = {
      records: this.records,
      seq: this.sequence + 1,
      overflowed: this.overflowed
    }
    this.records = []
    this.bytes = 0
    this.overflowed = false
    this.sequence += 1
    return result
  }
}
