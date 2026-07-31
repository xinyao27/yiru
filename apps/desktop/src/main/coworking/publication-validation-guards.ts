import { COWORKING_CATALOG_MAX_WORKTREES } from '~shared/coworking/catalog-contract'

import { CoworkingPublicationValidationError } from './publication-errors'
import { COWORKING_PUBLICATION_MAX_REGISTERED_WORKTREES } from './publication-inventory-limits'
import {
  haveUniqueCoworkingWorktreeIdentities,
  type CoworkingOwnerWorktree,
  type CoworkingWorktreeIncarnationUnavailableReason
} from './worktree-incarnation'

export type UnavailableCoworkingPublication = {
  instanceId: string
  reason: CoworkingWorktreeIncarnationUnavailableReason
}

export function assertCoworkingWorktreeInventoryCapacity(count: number): void {
  if (count > COWORKING_PUBLICATION_MAX_REGISTERED_WORKTREES) {
    throw new CoworkingPublicationValidationError('resource-limit')
  }
}

export function assertCoworkingPublicationCandidateCapacity(count: number): void {
  if (count > COWORKING_CATALOG_MAX_WORKTREES) {
    throw new CoworkingPublicationValidationError('resource-limit')
  }
}

export function assertUniqueCoworkingPublicationTargets(
  targets: readonly CoworkingOwnerWorktree[]
): void {
  if (!haveUniqueCoworkingWorktreeIdentities(targets)) {
    throw new CoworkingPublicationValidationError('invalid-catalog')
  }
}

export function addUnavailableCoworkingPublication(
  unavailable: UnavailableCoworkingPublication[],
  instanceId: string,
  reason: CoworkingWorktreeIncarnationUnavailableReason
): void {
  if (!unavailable.some((entry) => entry.instanceId === instanceId)) {
    unavailable.push({ instanceId, reason })
  }
}

export function coworkingPublicationTargetIdentityKey(target: CoworkingOwnerWorktree): string {
  return `${target.worktreeId}\0${target.instanceId}`
}
