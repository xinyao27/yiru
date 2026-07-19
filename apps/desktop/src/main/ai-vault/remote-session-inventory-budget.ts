import { SessionFileDiscoveryLimitError } from './session-scanner-discovery'
import {
  SPOOL_SESSION_INVENTORY_MAX_CANDIDATES,
  SPOOL_SESSION_INVENTORY_MAX_PATH_BYTES,
  SPOOL_SESSION_INVENTORY_MAX_TRAVERSAL_ENTRIES
} from './spool-session-inventory-source-discovery'

export type RemoteSessionInventoryBudget = {
  entries: number
  candidates: number
  pathBytes: number
}

export function createRemoteSessionInventoryBudget(): RemoteSessionInventoryBudget {
  return { entries: 0, candidates: 0, pathBytes: 0 }
}

export function remainingRemoteSessionInventoryEntries(
  budget: RemoteSessionInventoryBudget
): number {
  return SPOOL_SESSION_INVENTORY_MAX_TRAVERSAL_ENTRIES - budget.entries
}

export function consumeRemoteSessionInventoryEntry(
  path: string,
  budget: RemoteSessionInventoryBudget
): void {
  budget.entries++
  budget.pathBytes += Buffer.byteLength(path, 'utf8')
  if (
    budget.entries > SPOOL_SESSION_INVENTORY_MAX_TRAVERSAL_ENTRIES ||
    budget.pathBytes > SPOOL_SESSION_INVENTORY_MAX_PATH_BYTES
  ) {
    throw new SessionFileDiscoveryLimitError()
  }
}

export function consumeRemoteSessionInventoryCandidate(budget: RemoteSessionInventoryBudget): void {
  budget.candidates++
  if (budget.candidates > SPOOL_SESSION_INVENTORY_MAX_CANDIDATES) {
    throw new SessionFileDiscoveryLimitError()
  }
}
