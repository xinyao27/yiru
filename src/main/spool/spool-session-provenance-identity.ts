import type {
  SpoolLegacyPublicationAttestation,
  SpoolSessionProvenance,
  SpoolSessionProvenanceKey
} from './spool-session-provenance-index'

export function spoolSessionProvenanceKey(key: SpoolSessionProvenanceKey): string {
  return JSON.stringify([key.actualHostScope, key.provider, key.providerSessionId])
}

export function spoolLegacyAttestationKey(key: SpoolLegacyPublicationAttestation): string {
  return JSON.stringify([key.actualHostScope, key.worktreeInstanceId, key.spoolIncarnationId])
}

export function belongsToLegacyAttestation(
  entry: SpoolSessionProvenance,
  attestation: SpoolLegacyPublicationAttestation
): boolean {
  return (
    entry.actualHostScope === attestation.actualHostScope &&
    entry.worktreeInstanceId === attestation.worktreeInstanceId &&
    entry.spoolIncarnationId === attestation.spoolIncarnationId
  )
}

export function sameSpoolSessionProvenance(
  left: SpoolSessionProvenance,
  right: SpoolSessionProvenance
): boolean {
  return (
    left.actualHostScope === right.actualHostScope &&
    left.provider === right.provider &&
    left.providerSessionId === right.providerSessionId &&
    left.worktreeInstanceId === right.worktreeInstanceId &&
    left.spoolIncarnationId === right.spoolIncarnationId
  )
}
