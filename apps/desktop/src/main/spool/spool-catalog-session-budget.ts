import type { SpoolSessionCatalogEntry } from '../../shared/spool/spool-catalog-contract'

const MAX_MATERIALIZED_SESSIONS_PER_DESKTOP = 55_000
const MAX_MATERIALIZED_SESSION_BYTES_PER_DESKTOP = 64 * 1024 * 1024

/** Accounts for every session row retained by one remote Desktop catalog. */
export class SpoolCatalogSessionBudget {
  private sessionCount = 0
  private sessionBytes = 0

  retain(sessions: readonly SpoolSessionCatalogEntry[]): boolean {
    const bytes = spoolCatalogSessionsBytes(sessions)
    if (!this.fits(this.sessionCount + sessions.length, this.sessionBytes + bytes)) {
      return false
    }
    this.sessionCount += sessions.length
    this.sessionBytes += bytes
    return true
  }

  replace(
    previous: readonly SpoolSessionCatalogEntry[],
    next: readonly SpoolSessionCatalogEntry[]
  ): void {
    const count = this.sessionCount - previous.length + next.length
    const bytes =
      this.sessionBytes - spoolCatalogSessionsBytes(previous) + spoolCatalogSessionsBytes(next)
    if (!this.fits(count, bytes)) {
      throw new Error('spool_catalog_desktop_session_capacity_exceeded')
    }
    this.sessionCount = count
    this.sessionBytes = bytes
  }

  private fits(count: number, bytes: number): boolean {
    return (
      count <= MAX_MATERIALIZED_SESSIONS_PER_DESKTOP &&
      bytes <= MAX_MATERIALIZED_SESSION_BYTES_PER_DESKTOP
    )
  }
}

export function spoolCatalogSessionBytes(session: SpoolSessionCatalogEntry): number {
  return Buffer.byteLength(
    `${session.sessionRef}\0${session.kind}\0${session.agent ?? ''}\0${session.title}`,
    'utf8'
  )
}

function spoolCatalogSessionsBytes(sessions: readonly SpoolSessionCatalogEntry[]): number {
  return sessions.reduce((bytes, session) => bytes + spoolCatalogSessionBytes(session), 0)
}
