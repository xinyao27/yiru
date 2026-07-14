import type {
  SpoolHistoricalSessionCandidate,
  SpoolSessionRootMatcher,
  SpoolSessionSource,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import type {
  SpoolLegacyPublicationAttestation,
  SpoolSessionProvenance,
  SpoolSessionProvenanceIndex
} from './spool-session-provenance-index'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'
import type { SpoolOwnerWorktreeCatalog } from './spool-worktree-visibility'

const MAX_LEGACY_SESSION_CANDIDATES = 50_000

export type SpoolLegacySessionAttestationResult = {
  status: 'already-attested' | 'attested'
  sessionCount: number
}

export class SpoolLegacySessionAttestor {
  constructor(
    private readonly provenance: SpoolSessionProvenanceIndex,
    private readonly source: SpoolSessionSource,
    private readonly worktrees: SpoolOwnerWorktreeCatalog,
    private readonly roots: SpoolSessionRootMatcher
  ) {}

  async attestFirstPublication(
    target: SpoolOwnerWorktree,
    spoolIncarnationId: string
  ): Promise<SpoolLegacySessionAttestationResult> {
    const attestation = toPublicationAttestation(target, spoolIncarnationId)
    if (this.provenance.hasLegacyPublicationAttestation(attestation)) {
      return { status: 'already-attested', sessionCount: 0 }
    }
    const inventory = await this.worktrees.inspectRegisteredWorktrees()
    if (inventory.unavailableExecutionHostIds.includes(target.executionHostId)) {
      throw new Error('Spool legacy session target host is unavailable')
    }
    const registeredWorktrees = [...inventory.worktrees]
    requireRegisteredTarget(target, registeredWorktrees)
    const worktree = toSessionWorktree(target, spoolIncarnationId)
    const candidates = await this.source.listHistoricalSessions(worktree, 'legacy-attestation')
    if (candidates.length > MAX_LEGACY_SESSION_CANDIDATES) {
      throw new Error('Spool legacy session candidate limit exceeded')
    }
    const entries = await this.resolveEntries(
      target,
      spoolIncarnationId,
      registeredWorktrees,
      candidates
    )
    // Why: the migration marker and its positive proofs must be one atomic write.
    const changed = this.provenance.attestLegacyPublication(attestation, entries)
    return changed
      ? { status: 'attested', sessionCount: entries.length }
      : { status: 'already-attested', sessionCount: 0 }
  }

  private async resolveEntries(
    target: SpoolOwnerWorktree,
    spoolIncarnationId: string,
    registeredWorktrees: readonly SpoolOwnerWorktree[],
    candidates: readonly SpoolHistoricalSessionCandidate[]
  ): Promise<SpoolSessionProvenance[]> {
    const entries = new Map<string, SpoolSessionProvenance>()
    for (const candidate of candidates) {
      const entry = await this.resolveCandidate(
        target,
        spoolIncarnationId,
        registeredWorktrees,
        candidate
      )
      if (entry) {
        entries.set(toCandidateKey(entry), entry)
      }
    }
    return [...entries.values()]
  }

  private async resolveCandidate(
    target: SpoolOwnerWorktree,
    spoolIncarnationId: string,
    registeredWorktrees: readonly SpoolOwnerWorktree[],
    candidate: SpoolHistoricalSessionCandidate
  ): Promise<SpoolSessionProvenance | null> {
    if (candidate.executionHostId !== target.executionHostId || !candidate.attestationCwd) {
      return null
    }
    const matched = await this.roots.matchMostSpecificRoot({
      executionHostId: target.executionHostId,
      cwd: candidate.attestationCwd,
      registeredWorktrees
    })
    if (
      matched.status !== 'matched' ||
      matched.worktreeId !== target.worktreeId ||
      matched.instanceId !== target.instanceId
    ) {
      return null
    }
    return {
      executionHostId: target.executionHostId,
      provider: candidate.provider,
      providerSessionId: candidate.providerSessionId,
      worktreeInstanceId: target.instanceId,
      spoolIncarnationId
    }
  }
}

function toPublicationAttestation(
  target: SpoolOwnerWorktree,
  spoolIncarnationId: string
): SpoolLegacyPublicationAttestation {
  return {
    executionHostId: target.executionHostId,
    worktreeInstanceId: target.instanceId,
    spoolIncarnationId
  }
}

function toSessionWorktree(
  target: SpoolOwnerWorktree,
  spoolIncarnationId: string
): SpoolSessionWorktreeIdentity {
  return {
    worktreeId: target.worktreeId,
    instanceId: target.instanceId,
    spoolIncarnationId,
    target
  }
}

function requireRegisteredTarget(
  target: SpoolOwnerWorktree,
  registered: readonly SpoolOwnerWorktree[]
): void {
  const matches = registered.filter(
    (candidate) =>
      candidate.worktreeId === target.worktreeId &&
      candidate.instanceId === target.instanceId &&
      candidate.executionHostId === target.executionHostId
  )
  if (matches.length !== 1) {
    throw new Error('Spool legacy session target is not uniquely registered')
  }
}

function toCandidateKey(entry: SpoolSessionProvenance): string {
  return JSON.stringify([entry.executionHostId, entry.provider, entry.providerSessionId])
}
