import {
  COWORKING_SESSION_INVENTORY_MAX_CANDIDATES,
  COWORKING_SESSION_INVENTORY_MAX_PATH_BYTES,
  COWORKING_SESSION_INVENTORY_MAX_TRAVERSAL_ENTRIES
} from './coworking-session-inventory-source-discovery'
import { SessionFileDiscoveryLimitError } from './session-scanner-discovery'

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
  return COWORKING_SESSION_INVENTORY_MAX_TRAVERSAL_ENTRIES - budget.entries
}

export function consumeRemoteSessionInventoryEntry(
  path: string,
  budget: RemoteSessionInventoryBudget
): void {
  budget.entries++
  budget.pathBytes += Buffer.byteLength(path, 'utf8')
  if (
    budget.entries > COWORKING_SESSION_INVENTORY_MAX_TRAVERSAL_ENTRIES ||
    budget.pathBytes > COWORKING_SESSION_INVENTORY_MAX_PATH_BYTES
  ) {
    throw new SessionFileDiscoveryLimitError()
  }
}

export function consumeRemoteSessionInventoryCandidate(budget: RemoteSessionInventoryBudget): void {
  budget.candidates++
  if (budget.candidates > COWORKING_SESSION_INVENTORY_MAX_CANDIDATES) {
    throw new SessionFileDiscoveryLimitError()
  }
}
