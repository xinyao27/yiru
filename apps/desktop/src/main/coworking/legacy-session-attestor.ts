import { CoworkingExecutionError } from './execution-error'
import { readCoworkingHistoricalSessionPages } from './historical-session-pages'
import {
  COWORKING_SESSION_PROVENANCE_MAX_ENTRIES,
  type CoworkingLegacyPublicationAttestation,
  type CoworkingSessionProvenance,
  type CoworkingSessionProvenanceIndex
} from './session/provenance-index'
import type {
  CoworkingHistoricalSessionCandidate,
  CoworkingPreparedSessionRootMatcher,
  CoworkingSessionRootMatcher,
  CoworkingSessionSource,
  CoworkingSessionWorktreeIdentity
} from './session/source'
import {
  createEmptyCoworkingPublicationPersistence,
  type CoworkingPreparedPublicationPersistence
} from './visibility-persistence-transitions'
import type {
  CoworkingOwnerWorktree,
  CoworkingRegisteredWorktreeRoot,
  CoworkingWorktreeRootComparison
} from './worktree-incarnation'

export type CoworkingLegacyPublicationTarget = {
  target: CoworkingOwnerWorktree
  coworkingIncarnationId: string
  root: CoworkingWorktreeRootComparison
  forceRefresh?: boolean
}

type PendingPublication = CoworkingLegacyPublicationTarget & {
  attestation: CoworkingLegacyPublicationAttestation
  entries: Map<string, CoworkingSessionProvenance>
}

export class CoworkingLegacySessionAttestor {
  constructor(
    private readonly provenance: CoworkingSessionProvenanceIndex,
    private readonly source: CoworkingSessionSource,
    private readonly roots: CoworkingSessionRootMatcher
  ) {}

  async prepareFirstPublications(
    targets: readonly CoworkingLegacyPublicationTarget[],
    inventoryScope: string,
    registeredRoots: readonly CoworkingRegisteredWorktreeRoot[]
  ): Promise<CoworkingPreparedPublicationPersistence> {
    const pending = targets
      .map((entry): PendingPublication => ({
        ...entry,
        attestation: toPublicationAttestation(
          entry.root.scopeKey,
          entry.target,
          entry.coworkingIncarnationId
        ),
        entries: new Map()
      }))
      .filter(
        (entry) =>
          entry.forceRefresh || !this.provenance.hasLegacyPublicationAttestation(entry.attestation)
      )
    if (pending.length === 0) {
      return createEmptyCoworkingPublicationPersistence()
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
      for await (const page of readCoworkingHistoricalSessionPages(
        this.source,
        toSessionWorktree(
          scanTarget.root.scopeKey,
          scanTarget.target,
          scanTarget.coworkingIncarnationId
        ),
        'legacy-attestation',
        inventoryScope
      )) {
        observedCandidates += page.length
        if (observedCandidates > COWORKING_SESSION_PROVENANCE_MAX_ENTRIES) {
          throw new Error('Coworking legacy session attestation limit exceeded')
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
    executionHostId: CoworkingOwnerWorktree['executionHostId'],
    matcher: CoworkingPreparedSessionRootMatcher,
    publications: ReadonlyMap<string, PendingPublication>,
    page: readonly CoworkingHistoricalSessionCandidate[]
  ): Promise<void> {
    const candidates: { candidate: CoworkingHistoricalSessionCandidate; cwd: string }[] = []
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
        throw new CoworkingExecutionError('resource_unavailable')
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
  registeredRoots: readonly CoworkingRegisteredWorktreeRoot[]
): Map<string, PendingPublication> {
  const publications = new Map<string, PendingPublication>()
  for (const publication of pending) {
    requireRegisteredTarget(publication, registeredRoots)
    const key = worktreeIdentityKey(publication.target.worktreeId, publication.target.instanceId)
    if (publications.has(key)) {
      throw new Error('Coworking legacy session publication target is duplicated')
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
      throw new Error('Coworking actual-host scope spans multiple execution hosts')
    }
    entries.push(publication)
    groups.set(publication.root.scopeKey, entries)
  }
  return groups
}

function toProvenance(
  publication: PendingPublication,
  candidate: CoworkingHistoricalSessionCandidate
): CoworkingSessionProvenance {
  return {
    actualHostScope: publication.root.scopeKey,
    provider: candidate.provider,
    providerSessionId: candidate.providerSessionId,
    worktreeInstanceId: publication.target.instanceId,
    coworkingIncarnationId: publication.coworkingIncarnationId
  }
}

function toPublicationAttestation(
  actualHostScope: string,
  target: CoworkingOwnerWorktree,
  coworkingIncarnationId: string
): CoworkingLegacyPublicationAttestation {
  return {
    actualHostScope,
    worktreeInstanceId: target.instanceId,
    coworkingIncarnationId
  }
}

function toSessionWorktree(
  actualHostScope: string,
  target: CoworkingOwnerWorktree,
  coworkingIncarnationId: string
): CoworkingSessionWorktreeIdentity {
  return {
    worktreeId: target.worktreeId,
    instanceId: target.instanceId,
    coworkingIncarnationId,
    actualHostScope,
    target
  }
}

function requireRegisteredTarget(
  publication: CoworkingLegacyPublicationTarget,
  registered: readonly CoworkingRegisteredWorktreeRoot[]
): void {
  const matches = registered.filter(
    (candidate) =>
      candidate.target.worktreeId === publication.target.worktreeId &&
      candidate.target.instanceId === publication.target.instanceId &&
      candidate.target.executionHostId === publication.target.executionHostId &&
      rootsEqual(candidate.root, publication.root)
  )
  if (matches.length !== 1) {
    throw new Error('Coworking legacy session target is not uniquely registered')
  }
}

function rootsEqual(
  left: CoworkingWorktreeRootComparison,
  right: CoworkingWorktreeRootComparison
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

function candidateKey(entry: CoworkingSessionProvenance): string {
  return JSON.stringify([entry.actualHostScope, entry.provider, entry.providerSessionId])
}
