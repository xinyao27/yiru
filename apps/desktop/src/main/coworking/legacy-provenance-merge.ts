import {
  belongsToLegacyAttestation,
  sameCoworkingSessionProvenance,
  coworkingSessionProvenanceKey
} from './session/provenance-identity'
import type {
  CoworkingLegacyPublicationProof,
  CoworkingSessionProvenance
} from './session/provenance-index'

export function collectLegacyProvenanceCandidates(
  publications: readonly CoworkingLegacyPublicationProof[]
): ReadonlyMap<string, CoworkingSessionProvenance | null> {
  const candidates = new Map<string, CoworkingSessionProvenance | null>()
  for (const { attestation, entries } of publications) {
    for (const entry of entries) {
      if (!belongsToLegacyAttestation(entry, attestation)) {
        throw new Error('Legacy Coworking session provenance does not match its publication')
      }
      const key = coworkingSessionProvenanceKey(entry)
      const candidate = candidates.get(key)
      if (candidate === undefined) {
        candidates.set(key, entry)
      } else if (candidate !== null && !sameCoworkingSessionProvenance(candidate, entry)) {
        // Why: conflicting historical CWDs are not strong enough to choose one worktree.
        candidates.set(key, null)
      }
    }
  }
  return candidates
}
