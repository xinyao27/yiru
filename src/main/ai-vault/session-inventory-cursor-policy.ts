// Why: candidate parsing is bounded independently from the wire's 512-row session page.
export const DEFAULT_SESSION_INVENTORY_PAGE_SIZE = 512
// Why: each chain can retain a host inventory, so concurrent opens need a hard reservation cap.
export const DEFAULT_MAX_ACTIVE_SESSION_INVENTORIES = 256
// Why: callers explicitly release active chains; this timer only reclaims abandoned snapshots.
export const DEFAULT_SESSION_INVENTORY_IDLE_TTL_MS = 15 * 60_000
// Why: a small replay window tolerates lost replies without retaining unbounded cursor history.
export const MAX_REPLAYABLE_SESSION_INVENTORY_PAGES = 4
export const ACTIVE_SESSION_INVENTORY_EXPIRY_RECHECK_MS = 30_000

export type AiVaultSessionInventoryCursorStoreOptions = {
  pageSize?: number
  maxActiveInventories?: number
  idleTtlMs?: number
}
