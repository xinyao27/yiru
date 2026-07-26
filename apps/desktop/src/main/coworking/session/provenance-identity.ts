import type {
  CoworkingLegacyPublicationAttestation,
  CoworkingSessionProvenance,
  CoworkingSessionProvenanceKey
} from './provenance-index'

export function coworkingSessionProvenanceKey(key: CoworkingSessionProvenanceKey): string {
  return JSON.stringify([key.actualHostScope, key.provider, key.providerSessionId])
}

export function coworkingLegacyAttestationKey(key: CoworkingLegacyPublicationAttestation): string {
  return JSON.stringify([key.actualHostScope, key.worktreeInstanceId, key.coworkingIncarnationId])
}

export function belongsToLegacyAttestation(
  entry: CoworkingSessionProvenance,
  attestation: CoworkingLegacyPublicationAttestation
): boolean {
  return (
    entry.actualHostScope === attestation.actualHostScope &&
    entry.worktreeInstanceId === attestation.worktreeInstanceId &&
    entry.coworkingIncarnationId === attestation.coworkingIncarnationId
  )
}

export function sameCoworkingSessionProvenance(
  left: CoworkingSessionProvenance,
  right: CoworkingSessionProvenance
): boolean {
  return (
    left.actualHostScope === right.actualHostScope &&
    left.provider === right.provider &&
    left.providerSessionId === right.providerSessionId &&
    left.worktreeInstanceId === right.worktreeInstanceId &&
    left.coworkingIncarnationId === right.coworkingIncarnationId
  )
}
