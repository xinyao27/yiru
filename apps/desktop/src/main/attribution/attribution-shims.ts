import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { POSIX_GH_WRAPPER } from './attribution-posix-gh-wrapper'
import { POSIX_GIT_WRAPPER } from './attribution-posix-git-wrapper'
import { ATTRIBUTION_ROOT_DIR, ATTRIBUTION_SHIM_VERSION } from './attribution-values'
import { WIN32_GH_CMD_WRAPPER, WIN32_GIT_CMD_WRAPPER } from './attribution-windows-command-wrappers'
import { WIN32_GH_PS_WRAPPER } from './attribution-windows-gh-wrapper'
import { WIN32_GIT_PS_WRAPPER } from './attribution-windows-git-wrapper'

const writtenRoots = new Set<string>()

export type AttributionShimPaths = {
  posixDir: string
  win32Dir: string
}

export function ensureAttributionShims(userDataPath: string): AttributionShimPaths {
  const rootDir = join(userDataPath, ATTRIBUTION_ROOT_DIR)
  const posixDir = join(rootDir, 'posix')
  const win32Dir = join(rootDir, 'win32')
  const versionFile = join(rootDir, 'VERSION')

  if (writtenRoots.has(rootDir)) {
    return { posixDir, win32Dir }
  }

  if (readShimVersion(versionFile) === ATTRIBUTION_SHIM_VERSION) {
    writtenRoots.add(rootDir)
    return { posixDir, win32Dir }
  }

  mkdirSync(posixDir, { recursive: true })
  mkdirSync(win32Dir, { recursive: true })

  writeExecutable(join(posixDir, 'git'), POSIX_GIT_WRAPPER)
  writeExecutable(join(posixDir, 'gh'), POSIX_GH_WRAPPER)

  writeExecutable(join(win32Dir, 'git.cmd'), WIN32_GIT_CMD_WRAPPER)
  writeExecutable(join(win32Dir, 'gh.cmd'), WIN32_GH_CMD_WRAPPER)
  writeExecutable(join(win32Dir, 'git-wrapper.ps1'), WIN32_GIT_PS_WRAPPER)
  writeExecutable(join(win32Dir, 'gh-wrapper.ps1'), WIN32_GH_PS_WRAPPER)
  writeFileSync(versionFile, `${ATTRIBUTION_SHIM_VERSION}\n`, 'utf8')

  writtenRoots.add(rootDir)

  return { posixDir, win32Dir }
}

function readShimVersion(versionFile: string): string | null {
  try {
    return readFileSync(versionFile, 'utf8').trim()
  } catch {
    return null
  }
}

function writeExecutable(filePath: string, contents: string): void {
  writeFileSync(filePath, contents, 'utf8')
  chmodSync(filePath, 0o755)
}
