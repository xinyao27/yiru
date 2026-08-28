import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'
import { toWindowsWslPath } from '~main/platform/wsl'
import { buildEncodedWslBashCommand } from '~main/platform/wsl-bash-command'
import { getRuntimeHostPathsProvider } from '~main/runtime/host/paths-provider'

import { getSystemCodexHomePath } from '../home-paths'
import { assertOwnedHostCodexManagedHomePath } from './host-codex-managed-home-ownership'

const WINDOWS_RM_MAX_RETRIES = 8
const WINDOWS_RM_RETRY_DELAY_MS = 150

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function removeManagedHomeTreeSync(targetPath: string): void {
  rmSync(targetPath, {
    recursive: true,
    force: true,
    maxRetries: WINDOWS_RM_MAX_RETRIES,
    retryDelay: WINDOWS_RM_RETRY_DELAY_MS
  })
}

export function getCodexManagedAccountsRoot(): string {
  const root = join(getRuntimeHostPathsProvider().userDataPath(), 'codex-accounts')
  mkdirSync(root, { recursive: true })
  return root
}

export class CodexManagedHomeOwnership {
  assertPath(candidatePath: string, expectedAccountId?: string): string {
    const wslInfo = parseWslUncPath(candidatePath)
    if (wslInfo) {
      if (
        !wslInfo.linuxPath.includes('/.local/share/yiru/codex-accounts/') ||
        !wslInfo.linuxPath.endsWith('/home')
      ) {
        throw new Error('Managed WSL Codex home is outside Yiru account storage.')
      }
      if (
        expectedAccountId !== undefined &&
        !wslInfo.linuxPath.endsWith(`/.local/share/yiru/codex-accounts/${expectedAccountId}/home`)
      ) {
        throw new Error('Managed WSL Codex home does not match its persisted account ID.')
      }

      if (process.platform === 'win32') {
        try {
          const canonicalLinuxPath = execFileSync(
            'wsl.exe',
            [
              '-d',
              wslInfo.distro,
              '--',
              'bash',
              '-lc',
              buildEncodedWslBashCommand(
                [
                  'set -euo pipefail',
                  `candidate=${shellQuote(wslInfo.linuxPath)}`,
                  'managed_root="${HOME%/}/.local/share/yiru/codex-accounts"',
                  'candidate_real=$(readlink -f -- "$candidate")',
                  'managed_root_real=$(readlink -f -- "$managed_root")',
                  'test -f "$candidate_real/.yiru-managed-home"',
                  ...(expectedAccountId === undefined
                    ? [
                        'case "$candidate_real" in "$managed_root_real"/*/home) printf "%s\\n" "$candidate_real" ;; *) exit 35 ;; esac'
                      ]
                    : [
                        `expected_marker=${shellQuote(expectedAccountId)}`,
                        'test "$candidate_real" = "$managed_root_real/$expected_marker/home"',
                        'test "$(cat "$candidate_real/.yiru-managed-home")" = "$expected_marker"',
                        'printf "%s\\n" "$candidate_real"'
                      ])
                ].join('\n')
              )
            ],
            { encoding: 'utf-8', timeout: 5000 }
          ).trim()
          if (!canonicalLinuxPath) {
            throw new Error('Managed Codex home directory does not exist on disk.')
          }
          return toWindowsWslPath(canonicalLinuxPath, wslInfo.distro)
        } catch (error) {
          throw new Error('Managed WSL Codex home is outside Yiru account storage.', {
            cause: error
          })
        }
      }

      if (wslInfo.linuxPath.split('/').includes('..')) {
        throw new Error('Managed WSL Codex home is outside Yiru account storage.')
      }
      if (!existsSync(candidatePath)) {
        throw new Error('Managed Codex home directory does not exist on disk.')
      }
      if (!existsSync(join(candidatePath, '.yiru-managed-home'))) {
        throw new Error('Managed Codex home is missing Yiru ownership marker.')
      }
      if (
        expectedAccountId !== undefined &&
        readFileSync(join(candidatePath, '.yiru-managed-home'), 'utf-8').trim() !==
          expectedAccountId
      ) {
        throw new Error('Managed WSL Codex home ownership marker does not match its account ID.')
      }
      return candidatePath
    }

    return assertOwnedHostCodexManagedHomePath({
      candidatePath,
      managedAccountsRoot: getCodexManagedAccountsRoot(),
      systemCodexHomePath: getSystemCodexHomePath(),
      expectedAccountId
    })
  }

  cleanupCandidate(distro: string, linuxHomePath: string, expectedAccountId: string): void {
    // Why: WSL home creation can fail after mkdir/marker write but before the
    // path is trusted. Cleanup must prove the marker/account ID inside WSL.
    try {
      execFileSync(
        'wsl.exe',
        [
          '-d',
          distro,
          '--',
          'bash',
          '-lc',
          buildEncodedWslBashCommand(
            [
              'set -euo pipefail',
              `candidate=${shellQuote(linuxHomePath)}`,
              `expected_marker=${shellQuote(expectedAccountId)}`,
              'managed_root="${HOME%/}/.local/share/yiru/codex-accounts"',
              'candidate_real=$(readlink -f -- "$candidate" 2>/dev/null || true)',
              'managed_root_real=$(readlink -f -- "$managed_root" 2>/dev/null || true)',
              'test -n "$candidate_real"',
              'test -n "$managed_root_real"',
              'case "$candidate_real" in "$managed_root_real"/*/home) ;; *) exit 0 ;; esac',
              'test -f "$candidate_real/.yiru-managed-home"',
              'test "$(cat "$candidate_real/.yiru-managed-home")" = "$expected_marker"',
              'rm -rf -- "$candidate_real"',
              'parent_dir=$(dirname -- "$candidate_real")',
              'case "$parent_dir" in "$managed_root_real"/*) rmdir -- "$parent_dir" 2>/dev/null || true ;; esac'
            ].join('\n')
          )
        ],
        { encoding: 'utf-8', timeout: 5000 }
      )
    } catch (error) {
      console.warn('[codex-accounts] Failed to clean up WSL managed home candidate:', error)
    }
  }

  remove(candidatePath: string, expectedAccountId: string): void {
    let managedHomePath: string
    try {
      managedHomePath = this.assertPath(candidatePath, expectedAccountId)
    } catch (error) {
      console.warn('[codex-accounts] Refusing to remove untrusted managed home:', error)
      return
    }

    try {
      removeManagedHomeTreeSync(managedHomePath)
    } catch (error) {
      console.warn('[codex-accounts] Failed to remove managed home:', error)
      return
    }

    if (parseWslUncPath(managedHomePath)) {
      try {
        removeManagedHomeTreeSync(dirname(managedHomePath))
      } catch {
        // Best-effort cleanup
      }
      return
    }

    // Why: managed homes live at <accounts-root>/<uuid>/home. Removing
    // just the home/ leaf leaves an empty <uuid>/ directory behind.
    try {
      const parentDir = resolve(managedHomePath, '..')
      // Why: managedHomePath is already canonicalized by assertManagedHomePath,
      // so the root must be canonicalized too for the prefix check to work on
      // macOS where userData resolves through /private/var.
      const root = realpathSync(getCodexManagedAccountsRoot())
      if (parentDir.startsWith(root + sep) && parentDir !== root) {
        removeManagedHomeTreeSync(parentDir)
      }
    } catch {
      // Best-effort cleanup
    }
  }
}
