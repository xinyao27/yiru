import { execFile } from 'node:child_process'
import { parseWslUncPath } from '../../shared/wsl-paths'
import { toLinuxPath, toWindowsWslPath } from '../wsl'

const WSL_CANONICAL_PATH_PREFIX = '__YIRU_SPOOL_CANONICAL_PATH__'
const WSL_DIRECTORY_IDENTITY_PREFIX = '__YIRU_SPOOL_DIRECTORY_IDENTITY__'
const WSL_MISSING_PATH = '__YIRU_SPOOL_MISSING_PATH__'

export type SpoolWslCanonicalDirectoryResult =
  | { status: 'resolved'; path: string }
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'unavailable' }

export type SpoolWslDirectoryIdentityResult =
  | { status: 'resolved'; path: string; deviceId: string; inodeId: string }
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'unavailable' }

/** Resolves WSL paths inside the distro because Win32 9P can report false ENOENT. */
export function resolveSpoolWslCanonicalDirectory(
  uncPath: string
): Promise<SpoolWslCanonicalDirectoryResult> {
  return runSpoolWslProbe(
    uncPath,
    `if ! test -d "$1"; then printf ${WSL_MISSING_PATH}; exit 0; fi; canonical=$(readlink -f -- "$1") || exit; printf ${WSL_CANONICAL_PATH_PREFIX}%s "$canonical"`
  ).then(({ distro, output }) => {
    if (output === WSL_MISSING_PATH) {
      return { status: 'missing' }
    }
    const canonical = output?.startsWith(WSL_CANONICAL_PATH_PREFIX)
      ? output.slice(WSL_CANONICAL_PATH_PREFIX.length)
      : null
    if (!canonical) {
      return { status: 'unavailable' }
    }
    return canonical.startsWith('/') && distro
      ? { status: 'resolved', path: toWindowsWslPath(canonical, distro) }
      : { status: 'invalid' }
  })
}

/** Reads physical directory identity inside WSL, where Win32 metadata is not authoritative. */
export function inspectSpoolWslDirectoryIdentity(
  candidatePath: string,
  wslDistro?: string
): Promise<SpoolWslDirectoryIdentityResult> {
  return runSpoolWslProbe(
    candidatePath,
    `if ! test -d "$1"; then printf ${WSL_MISSING_PATH}; exit 0; fi; canonical=$(readlink -f -- "$1") || exit; identity=$(stat -Lc '%d:%i' -- "$canonical") || exit; printf ${WSL_DIRECTORY_IDENTITY_PREFIX}%s: "$identity"; printf %s "$canonical"`,
    wslDistro
  ).then(({ distro, output }) => {
    if (output === WSL_MISSING_PATH) {
      return { status: 'missing' }
    }
    const payload = output?.startsWith(WSL_DIRECTORY_IDENTITY_PREFIX)
      ? output.slice(WSL_DIRECTORY_IDENTITY_PREFIX.length)
      : null
    const match = payload?.match(/^(\d+):(\d+):([\s\S]+)$/u)
    if (!match || !distro) {
      return { status: 'unavailable' }
    }
    const [, deviceId, inodeId, canonical] = match
    if (!deviceId || !inodeId || !canonical?.startsWith('/') || inodeId === '0') {
      return { status: 'invalid' }
    }
    return {
      status: 'resolved',
      path: toWindowsWslPath(canonical, distro),
      deviceId,
      inodeId
    }
  })
}

function runSpoolWslProbe(
  uncPath: string,
  script: string,
  fallbackDistro?: string
): Promise<{ distro: string | null; output: string | null }> {
  // Why: a configured WSL runtime can own a native Windows path with no UNC distro hint.
  const fallback = fallbackDistro
    ? { distro: fallbackDistro, linuxPath: toLinuxPath(uncPath) }
    : null
  const parsed = process.platform === 'win32' ? (parseWslUncPath(uncPath) ?? fallback) : null
  if (!parsed) {
    return Promise.resolve({ distro: null, output: null })
  }
  return new Promise((resolve) => {
    execFile(
      'wsl.exe',
      ['-d', parsed.distro, '--', 'sh', '-c', script, 'yiru-spool-path', parsed.linuxPath],
      { encoding: 'utf8', timeout: 5_000, windowsHide: true },
      (error, stdout) =>
        resolve({
          distro: parsed.distro,
          output: error || typeof stdout !== 'string' ? null : stdout
        })
    )
  })
}
