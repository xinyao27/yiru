import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { assertOwnedHostCodexManagedHomePath } from '../codex-accounts/host-codex-managed-home-ownership'
import { getSystemCodexHomePath, getYiruUserDataPath } from './codex-home-paths'

/**
 * Session roots for every self-contained host Codex account home on disk.
 * Disk discovery includes retained accounts unavailable to settings-only callers;
 * WSL homes remain scoped to their distro's own scanner lane.
 */
export function getCodexAccountHomeSessionDirectories(): string[] {
  const accountsRoot = join(getYiruUserDataPath(), 'codex-accounts')
  try {
    return readdirSync(accountsRoot, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory()) {
        return []
      }
      const accountHome = join(accountsRoot, entry.name, 'home')
      try {
        assertOwnedHostCodexManagedHomePath({
          candidatePath: accountHome,
          managedAccountsRoot: accountsRoot,
          systemCodexHomePath: getSystemCodexHomePath(),
          expectedAccountId: entry.name
        })
        const sessionsPath = join(accountHome, 'sessions')
        // Why: a redirected sessions root could make a usage scan escape into
        // an unrelated or unbounded tree.
        return lstatSync(sessionsPath).isDirectory() ? [sessionsPath] : []
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}
