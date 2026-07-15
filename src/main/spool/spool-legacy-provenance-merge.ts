import {
  belongsToLegacyAttestation,
  sameSpoolSessionProvenance,
  spoolSessionProvenanceKey
} from './spool-session-provenance-identity'
import type {
  SpoolLegacyPublicationProof,
  SpoolSessionProvenance
} from './spool-session-provenance-index'

export function collectLegacyProvenanceCandidates(
  publications: readonly SpoolLegacyPublicationProof[]
): ReadonlyMap<string, SpoolSessionProvenance | null> {
  const candidates = new Map<string, SpoolSessionProvenance | null>()
  for (const { attestation, entries } of publications) {
    for (const entry of entries) {
      if (!belongsToLegacyAttestation(entry, attestation)) {
        throw new Error('Legacy Spool session provenance does not match its publication')
      }
      const key = spoolSessionProvenanceKey(entry)
      const candidate = candidates.get(key)
      if (candidate === undefined) {
        candidates.set(key, entry)
      } else if (candidate !== null && !sameSpoolSessionProvenance(candidate, entry)) {
        // Why: conflicting historical CWDs are not strong enough to choose one worktree.
        candidates.set(key, null)
      }
    }
  }
  return candidates
}
