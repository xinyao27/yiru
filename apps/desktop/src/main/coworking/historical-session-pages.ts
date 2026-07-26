import { COWORKING_SESSION_PROVENANCE_MAX_ENTRIES } from './session/provenance-index'
import type {
  CoworkingHistoricalSessionCandidate,
  CoworkingHistoricalSessionPurpose,
  CoworkingSessionSource,
  CoworkingSessionWorktreeIdentity
} from './session/source'

export const COWORKING_HISTORICAL_SESSION_PAGE_SIZE = 512

const MAX_CURSOR_LENGTH = 2_048
const MAX_SESSION_PAGE_CHAIN_LENGTH = COWORKING_SESSION_PROVENANCE_MAX_ENTRIES

/** Iterates to the scanner's real end; a malformed continuation never becomes completeness. */
export async function* readCoworkingHistoricalSessionPages(
  source: CoworkingSessionSource,
  worktree: CoworkingSessionWorktreeIdentity,
  purpose: CoworkingHistoricalSessionPurpose,
  inventoryScope: string,
  signal?: AbortSignal
): AsyncGenerator<readonly CoworkingHistoricalSessionCandidate[]> {
  const seenCursors = new Set<string>()
  let cursor: string | null = null
  let scannedAt: string | null = null
  let observedSessions = 0
  let complete = false

  try {
    for (let pageIndex = 0; pageIndex < MAX_SESSION_PAGE_CHAIN_LENGTH; pageIndex++) {
      signal?.throwIfAborted()
      // The source receives the same signal; take ownership of its next cursor
      // before observing a post-await abort so cleanup can release the minted chain.
      const page = await source.listHistoricalSessionPage(
        worktree,
        purpose,
        cursor,
        inventoryScope,
        signal
      )
      requireValidCursor(page.nextCursor)
      cursor = page.nextCursor
      signal?.throwIfAborted()
      requireValidPagePayload(page.sessions, page.scannedAt)
      if (scannedAt !== null && page.scannedAt !== scannedAt) {
        throw new Error('Coworking historical session inventory changed during pagination')
      }
      scannedAt = page.scannedAt
      observedSessions += page.sessions.length
      if (observedSessions > COWORKING_SESSION_PROVENANCE_MAX_ENTRIES) {
        throw new Error('Coworking historical session inventory capacity exceeded')
      }
      const nextCursor = page.nextCursor
      if (nextCursor !== null && seenCursors.has(nextCursor)) {
        throw new Error('Coworking historical session cursor cycle')
      }
      if (nextCursor !== null) {
        seenCursors.add(nextCursor)
      }
      yield page.sessions
      if (nextCursor === null) {
        complete = true
        return
      }
    }

    // Why: a hostile or broken host must fail closed instead of holding a catalog read forever.
    throw new Error('Coworking historical session page chain limit exceeded')
  } finally {
    if (!complete) {
      try {
        // Why: null releases cancel an opening inventory that has not minted its first cursor yet.
        await source.releaseHistoricalSessionPage(worktree, purpose, cursor, inventoryScope)
      } catch {
        // Cleanup is best-effort and must not replace the page failure that aborted this chain.
      }
    }
  }
}

function requireValidPagePayload(
  sessions: readonly CoworkingHistoricalSessionCandidate[],
  scannedAt: string
): void {
  if (scannedAt.length === 0 || scannedAt.length > 128 || scannedAt.includes('\0')) {
    throw new Error('Invalid Coworking historical session inventory revision')
  }
  if (sessions.length > COWORKING_HISTORICAL_SESSION_PAGE_SIZE) {
    throw new Error('Coworking historical session page size exceeded')
  }
}

function requireValidCursor(nextCursor: string | null): void {
  if (nextCursor === null) {
    return
  }
  if (
    nextCursor.length === 0 ||
    nextCursor.length > MAX_CURSOR_LENGTH ||
    nextCursor.includes('\0')
  ) {
    throw new Error('Invalid Coworking historical session continuation')
  }
}
