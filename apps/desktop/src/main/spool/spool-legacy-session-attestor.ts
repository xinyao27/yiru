import { SpoolExecutionError } from './spool-execution-error'
import { readSpoolHistoricalSessionPages } from './spool-historical-session-pages'
import {
  SPOOL_SESSION_PROVENANCE_MAX_ENTRIES,
  type SpoolLegacyPublicationAttestation,
  type SpoolSessionProvenance,
  type SpoolSessionProvenanceIndex
} from './spool-session-provenance-index'
import type {
  SpoolHistoricalSessionCandidate,
  SpoolPreparedSessionRootMatcher,
  SpoolSessionRootMatcher,
  SpoolSessionSource,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import {
  createEmptySpoolPublicationPersistence,
  type SpoolPreparedPublicationPersistence
} from './spool-visibility-persistence-transitions'
import type {
  SpoolOwnerWorktree,
  SpoolRegisteredWorktreeRoot,
  SpoolWorktreeRootComparison
} from './spool-worktree-incarnation'

export type SpoolLegacyPublicationTarget = {
  target: SpoolOwnerWorktree
  spoolIncarnationId: string
  root: SpoolWorktreeRootComparison
  forceRefresh?: boolean
}

type PendingPublication = SpoolLegacyPublicationTarget & {
  attestation: SpoolLegacyPublicationAttestation
  entries: Map<string, SpoolSessionProvenance>
}

export class SpoolLegacySessionAttestor {
  constructor(
    private readonly provenance: SpoolSessionProvenanceIndex,
    private readonly source: SpoolSessionSource,
    private readonly roots: SpoolSessionRootMatcher
  ) {}

  async prepareFirstPublications(
    targets: readonly SpoolLegacyPublicationTarget[],
    inventoryScope: string,
    registeredRoots: readonly SpoolRegisteredWorktreeRoot[]
  ): Promise<SpoolPreparedPublicationPersistence> {
    const pending = targets
      .map(
        (entry): PendingPublication => ({
          ...entry,
          attestation: toPublicationAttestation(
            entry.root.scopeKey,
            entry.target,
            entry.spoolIncarnationId
          ),
          entries: new Map()
        })
      )
      .filter(
        (entry) =>
          entry.forceRefresh || !this.provenance.hasLegacyPublicationAttestation(entry.attestation)
      )
    if (pending.length === 0) {
      return createEmptySpoolPublicationPersistence()
    }
    const publicationByWorktree = indexPublications(pending, registeredRoots)
    const groups = groupPublicationsByActualHost(pending)
    let observedCandidates = 0
    for (const group of groups.values()) {
      const scanTarget = group[0]
      if (!scanTarget) {
        continue
      }
      const matcher = this.roots.prepare({
        actualHostScope: scanTarget.root.scopeKey,
        inventoryTarget: scanTarget.target,
        registeredRoots,
        binding: 'legacy-cwd-attribution'
      })
      for await (const page of readSpoolHistoricalSessionPages(
        this.source,
        toSessionWorktree(
          scanTarget.root.scopeKey,
          scanTarget.target,
          scanTarget.spoolIncarnationId
        ),
        'legacy-attestation',
        inventoryScope
      )) {
        observedCandidates += page.length
        if (observedCandidates > SPOOL_SESSION_PROVENANCE_MAX_ENTRIES) {
          throw new Error('Spool legacy session attestation limit exceeded')
        }
        await this.collectPageProofs(
          scanTarget.root.scopeKey,
          scanTarget.target.executionHostId,
          matcher,
          publicationByWorktree,
          page
        )
      }
    }
    const proofs = pending.map((publication) => ({
      attestation: { ...publication.attestation },
      entries: [...publication.entries.values()].map((entry) => ({ ...entry })),
      forceRefresh: publication.forceRefresh
    }))
    const attestations = pending.map((publication) => ({ ...publication.attestation }))
    return {
      // Why: the final registered-root guard must pass before a legacy scan becomes durable proof.
      persistProofs: () => {
        this.provenance.attestLegacyPublicationProofs(proofs)
      },
      completeAttestation: () => {
        this.provenance.completeLegacyPublications(attestations)
      }
    }
  }

  private async collectPageProofs(
    actualHostScope: string,
    executionHostId: SpoolOwnerWorktree['executionHostId'],
    matcher: SpoolPreparedSessionRootMatcher,
    publications: ReadonlyMap<string, PendingPublication>,
    page: readonly SpoolHistoricalSessionCandidate[]
  ): Promise<void> {
    const candidates: { candidate: SpoolHistoricalSessionCandidate; cwd: string }[] = []
    for (const candidate of page) {
      if (
        candidate.actualHostScope === actualHostScope &&
        candidate.executionHostId === executionHostId &&
        candidate.attestationCwd
      ) {
        candidates.push({ candidate, cwd: candidate.attestationCwd })
      }
    }
    const matches = await matcher.matchMostSpecificRoots(candidates.map((entry) => entry.cwd))
    matches.forEach((matched, index) => {
      if (matched?.status === 'unavailable') {
        throw new SpoolExecutionError('resource_unavailable')
      }
      const candidate = candidates[index]?.candidate
      if (!candidate || matched?.status !== 'matched') {
        return
      }
      const publication = publications.get(
        worktreeIdentityKey(matched.worktreeId, matched.instanceId)
      )
      if (!publication) {
        return
      }
      const entry = toProvenance(publication, candidate)
      publication.entries.set(candidateKey(entry), entry)
    })
  }
}

function indexPublications(
  pending: readonly PendingPublication[],
  registeredRoots: readonly SpoolRegisteredWorktreeRoot[]
): Map<string, PendingPublication> {
  const publications = new Map<string, PendingPublication>()
  for (const publication of pending) {
    requireRegisteredTarget(publication, registeredRoots)
    const key = worktreeIdentityKey(publication.target.worktreeId, publication.target.instanceId)
    if (publications.has(key)) {
      throw new Error('Spool legacy session publication target is duplicated')
    }
    publications.set(key, publication)
  }
  return publications
}

function groupPublicationsByActualHost(
  pending: readonly PendingPublication[]
): Map<string, PendingPublication[]> {
  const groups = new Map<string, PendingPublication[]>()
  for (const publication of pending) {
    const entries = groups.get(publication.root.scopeKey) ?? []
    if (
      entries.some((entry) => entry.target.executionHostId !== publication.target.executionHostId)
    ) {
      throw new Error('Spool actual-host scope spans multiple execution hosts')
    }
    entries.push(publication)
    groups.set(publication.root.scopeKey, entries)
  }
  return groups
}

function toProvenance(
  publication: PendingPublication,
  candidate: SpoolHistoricalSessionCandidate
): SpoolSessionProvenance {
  return {
    actualHostScope: publication.root.scopeKey,
    provider: candidate.provider,
    providerSessionId: candidate.providerSessionId,
    worktreeInstanceId: publication.target.instanceId,
    spoolIncarnationId: publication.spoolIncarnationId
  }
}

function toPublicationAttestation(
  actualHostScope: string,
  target: SpoolOwnerWorktree,
  spoolIncarnationId: string
): SpoolLegacyPublicationAttestation {
  return {
    actualHostScope,
    worktreeInstanceId: target.instanceId,
    spoolIncarnationId
  }
}

function toSessionWorktree(
  actualHostScope: string,
  target: SpoolOwnerWorktree,
  spoolIncarnationId: string
): SpoolSessionWorktreeIdentity {
  return {
    worktreeId: target.worktreeId,
    instanceId: target.instanceId,
    spoolIncarnationId,
    actualHostScope,
    target
  }
}

function requireRegisteredTarget(
  publication: SpoolLegacyPublicationTarget,
  registered: readonly SpoolRegisteredWorktreeRoot[]
): void {
  const matches = registered.filter(
    (candidate) =>
      candidate.target.worktreeId === publication.target.worktreeId &&
      candidate.target.instanceId === publication.target.instanceId &&
      candidate.target.executionHostId === publication.target.executionHostId &&
      rootsEqual(candidate.root, publication.root)
  )
  if (matches.length !== 1) {
    throw new Error('Spool legacy session target is not uniquely registered')
  }
}

function rootsEqual(
  left: SpoolWorktreeRootComparison,
  right: SpoolWorktreeRootComparison
): boolean {
  return (
    left.scopeKey === right.scopeKey &&
    left.rootKey === right.rootKey &&
    left.ancestorKeys.length === right.ancestorKeys.length &&
    left.ancestorKeys.every((key, index) => key === right.ancestorKeys[index])
  )
}

function worktreeIdentityKey(worktreeId: string, instanceId: string): string {
  return JSON.stringify([worktreeId, instanceId])
}

function candidateKey(entry: SpoolSessionProvenance): string {
  return JSON.stringify([entry.actualHostScope, entry.provider, entry.providerSessionId])
}
