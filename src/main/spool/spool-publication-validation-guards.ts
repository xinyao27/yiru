import { SPOOL_CATALOG_MAX_WORKTREES } from '../../shared/spool/spool-catalog-contract'
import { SPOOL_PUBLICATION_MAX_REGISTERED_WORKTREES } from './spool-publication-inventory-limits'
import { SpoolPublicationValidationError } from './spool-publication-errors'
import {
  haveUniqueSpoolWorktreeIdentities,
  type SpoolOwnerWorktree,
  type SpoolWorktreeIncarnationUnavailableReason
} from './spool-worktree-incarnation'

export type UnavailableSpoolPublication = {
  instanceId: string
  reason: SpoolWorktreeIncarnationUnavailableReason
}

export function assertSpoolWorktreeInventoryCapacity(count: number): void {
  if (count > SPOOL_PUBLICATION_MAX_REGISTERED_WORKTREES) {
    throw new SpoolPublicationValidationError('resource-limit')
  }
}

export function assertSpoolPublicationCandidateCapacity(count: number): void {
  if (count > SPOOL_CATALOG_MAX_WORKTREES) {
    throw new SpoolPublicationValidationError('resource-limit')
  }
}

export function assertUniqueSpoolPublicationTargets(targets: readonly SpoolOwnerWorktree[]): void {
  if (!haveUniqueSpoolWorktreeIdentities(targets)) {
    throw new SpoolPublicationValidationError('invalid-catalog')
  }
}

export function addUnavailableSpoolPublication(
  unavailable: UnavailableSpoolPublication[],
  instanceId: string,
  reason: SpoolWorktreeIncarnationUnavailableReason
): void {
  if (!unavailable.some((entry) => entry.instanceId === instanceId)) {
    unavailable.push({ instanceId, reason })
  }
}

export function spoolPublicationTargetIdentityKey(target: SpoolOwnerWorktree): string {
  return `${target.worktreeId}\0${target.instanceId}`
}
