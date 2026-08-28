import type { GhAuthAccount } from '~main/github-auth-types'

/**
 * gh CLI auth diagnostics.
 *
 * Why: when GitHub queries fail with a missing scope, the canned
 * remediation `gh auth refresh -s repo ...` silently no-ops if the user
 * has `GITHUB_TOKEN` (or `GH_TOKEN`) exported in their shell — gh prefers
 * env tokens over keyring credentials and refuses to refresh env-supplied
 * tokens. Users follow the instructions, see no error, retry, and stay
 * stuck. This probe makes that failure mode legible in the UI.
 *
 * Output is parsed from `gh auth status`, which prints free-form text but
 * uses stable field labels ("Token scopes:", "(GITHUB_TOKEN)", etc.).
 */

/**
 * Parse `gh auth status` stderr/stdout. gh writes to stderr by default but
 * has used stdout in some versions; we accept either. Format (per host):
 *
 *   github.com
 *     ✓ Logged in to github.com account NAME (GITHUB_TOKEN)
 *     - Active account: true
 *     - Token scopes: 'gist', 'read:org', 'repo'
 */
export function parseAuthStatus(text: string): GhAuthAccount[] {
  const accounts: GhAuthAccount[] = []
  let currentHost: string | null = null
  let current: GhAuthAccount | null = null
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    // Host header: a non-indented hostname token, with an optional
    // trailing colon some gh versions emit. Permits single-label hostnames
    // (internal GHES like `github` or `ghe-internal`); we also recover the
    // host from the `Logged in to <host>` line below if this header was
    // missed, so a parser miss never silently drops every account.
    const hostMatch = line.match(/^([a-z0-9][a-z0-9.-]*)\s*:?\s*$/i)
    if (hostMatch && !/^logged\b/i.test(line)) {
      currentHost = hostMatch[1]
      continue
    }
    const loggedIn = line.match(/Logged in to (\S+) account (\S+)(?:\s+\(([^)]+)\))?/i)
    if (loggedIn) {
      if (current) {
        accounts.push(current)
      }
      // Prefer the host from the `Logged in to <host>` line itself — it's
      // always present, whereas the section header above can be skipped
      // by the regex on unfamiliar gh output.
      const host = loggedIn[1] || currentHost || 'github.com'
      const sourceLabel = (loggedIn[3] ?? '').trim()
      // gh emits "(keyring)" for stored creds and "(GITHUB_TOKEN)" /
      // "(GH_TOKEN)" when an env var is shadowing the keyring.
      const envToken =
        sourceLabel === 'GITHUB_TOKEN' || sourceLabel === 'GH_TOKEN' ? sourceLabel : null
      current = {
        host,
        user: loggedIn[2],
        active: false,
        envToken,
        source: envToken ? 'env' : 'keyring',
        scopes: []
      }
      continue
    }
    if (!current) {
      continue
    }
    const activeMatch = line.match(/Active account:\s*(true|false)/i)
    if (activeMatch) {
      current.active = activeMatch[1].toLowerCase() === 'true'
      continue
    }
    const scopesMatch = line.match(/Token scopes:\s*(.+)$/i)
    if (scopesMatch) {
      current.scopes = scopesMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    }
  }
  if (current) {
    accounts.push(current)
  }
  return accounts
}
