import { execFile } from 'node:child_process'
import { parseWslUncPath } from '../../shared/wsl-paths'
import { toWindowsWslPath } from '../wsl'

const WSL_CANONICAL_PATH_PREFIX = '__ORCA_SPOOL_CANONICAL_PATH__'
const WSL_FILE_PRESENT = '__ORCA_SPOOL_FILE_PRESENT__'
const WSL_MISSING_PATH = '__ORCA_SPOOL_MISSING_PATH__'

export type SpoolWslCanonicalDirectoryResult =
  | { status: 'resolved'; path: string }
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'unavailable' }

export type SpoolWslFileEvidence = 'present' | 'missing' | 'unavailable'

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

/** Confirms a false Win32 ENOENT without reading marker contents through WSL. */
export function inspectSpoolWslFile(uncPath: string): Promise<SpoolWslFileEvidence> {
  return runSpoolWslProbe(
    uncPath,
    `if test -f "$1"; then printf ${WSL_FILE_PRESENT}; else printf ${WSL_MISSING_PATH}; fi`
  ).then(({ output }) =>
    output === WSL_FILE_PRESENT
      ? 'present'
      : output === WSL_MISSING_PATH
        ? 'missing'
        : 'unavailable'
  )
}

function runSpoolWslProbe(
  uncPath: string,
  script: string
): Promise<{ distro: string | null; output: string | null }> {
  const parsed = process.platform === 'win32' ? parseWslUncPath(uncPath) : null
  if (!parsed) {
    return Promise.resolve({ distro: null, output: null })
  }
  return new Promise((resolve) => {
    execFile(
      'wsl.exe',
      ['-d', parsed.distro, '--', 'sh', '-c', script, 'orca-spool-path', parsed.linuxPath],
      { encoding: 'utf8', timeout: 5_000, windowsHide: true },
      (error, stdout) =>
        resolve({
          distro: parsed.distro,
          output: error || typeof stdout !== 'string' ? null : stdout
        })
    )
  })
}
