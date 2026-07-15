import {
  SPOOL_SESSION_INVENTORY_MAX_CANDIDATES,
  SPOOL_SESSION_INVENTORY_MAX_PATH_BYTES
} from './spool-session-inventory-source-discovery'

const CANDIDATE_OBJECT_OVERHEAD_BYTES = 512

export const SPOOL_SESSION_INVENTORY_SNAPSHOT_MAX_RETAINED_BYTES = 256 * 1024 * 1024
// Why: an opening can hold both transcript and Codex-home paths before its exact size is known.
export const SPOOL_SESSION_INVENTORY_SNAPSHOT_OPENING_RESERVATION_BYTES =
  2 * SPOOL_SESSION_INVENTORY_MAX_PATH_BYTES +
  SPOOL_SESSION_INVENTORY_MAX_CANDIDATES * CANDIDATE_OBJECT_OVERHEAD_BYTES

export function estimateSpoolSessionInventorySnapshotBytes(
  candidates: readonly { file: { path: string }; codexHome?: string | null }[]
): number {
  let bytes = 0
  for (const candidate of candidates) {
    bytes += Buffer.byteLength(candidate.file.path, 'utf8') + CANDIDATE_OBJECT_OVERHEAD_BYTES
    if (candidate.codexHome) {
      bytes += Buffer.byteLength(candidate.codexHome, 'utf8')
    }
  }
  return bytes
}
