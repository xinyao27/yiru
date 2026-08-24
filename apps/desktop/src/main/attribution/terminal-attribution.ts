import { YIRU_GIT_COMMIT_TRAILER } from '~shared/yiru-attribution'

import { resolveWindowsExecutable, stripAttributionPathEntries } from './attribution-path'
import { ensureAttributionShims, type AttributionShimPaths } from './attribution-shims'
import { ATTRIBUTION_ENV_KEYS, YIRU_GH_FOOTER } from './attribution-values'

export type AttributionShellFamily = 'native-windows' | 'posix'

export function resolveAttributionShellFamily(options: {
  platform?: NodeJS.Platform
  shellPath?: string
  isWsl?: boolean
}): AttributionShellFamily | undefined {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') {
    return undefined
  }
  const shellName = options.shellPath?.replaceAll('\\', '/').split('/').pop()?.toLowerCase()
  if (options.isWsl || shellName === 'wsl.exe' || shellName === 'wsl') {
    return 'posix'
  }
  if (shellName === 'bash.exe' || shellName === 'sh.exe' || shellName === 'zsh.exe') {
    return 'posix'
  }
  return 'native-windows'
}

export function applyTerminalAttributionEnv(
  baseEnv: Record<string, string>,
  options: {
    enabled: boolean
    userDataPath: string
    platform?: NodeJS.Platform
    shellFamily?: AttributionShellFamily
  }
): void {
  const platform = options.platform ?? process.platform
  if (!options.enabled) {
    clearTerminalAttributionEnv(baseEnv, platform)
    return
  }

  let shimPaths: AttributionShimPaths
  try {
    shimPaths = ensureAttributionShims(options.userDataPath)
  } catch {
    return
  }

  const pathDelimiter = platform === 'win32' ? ';' : ':'
  const basePath = baseEnv.PATH ?? process.env.PATH ?? ''
  // Why: resolve real Windows commands before prepending shims so cmd wrappers
  // cannot recursively point YIRU_REAL_* at themselves.
  const resolvedGit = platform === 'win32' ? resolveWindowsExecutable('git', basePath) : null
  const resolvedGh = platform === 'win32' ? resolveWindowsExecutable('gh', basePath) : null
  const { posixDir, win32Dir } = shimPaths
  const shellFamily = options.shellFamily ?? (platform === 'win32' ? 'native-windows' : 'posix')
  // Why: Windows native shells can try to open extensionless POSIX shims before
  // PATHEXT reaches git.cmd, which surfaces an "Open With" dialog.
  const prependDirs =
    platform === 'win32' && shellFamily === 'native-windows' ? [win32Dir] : [posixDir]
  const prependDirKeys = new Set(
    prependDirs.map((dir) => (platform === 'win32' ? dir.toLowerCase() : dir))
  )
  const cleanedBasePath = stripAttributionPathEntries(basePath, pathDelimiter)
    .split(pathDelimiter)
    .filter((entry) => {
      if (!entry) {
        return false
      }
      const key = platform === 'win32' ? entry.toLowerCase() : entry
      return !prependDirKeys.has(key)
    })
    .join(pathDelimiter)

  // Why: these wrappers should affect only Yiru-managed PTYs. Prepending the
  // shim directory here keeps the attribution behavior scoped to Yiru's live
  // terminal environment instead of mutating global git/gh config or the
  // user's external shell PATH.
  baseEnv.PATH = [...prependDirs, cleanedBasePath].filter(Boolean).join(pathDelimiter)
  baseEnv.YIRU_ENABLE_GIT_ATTRIBUTION = '1'
  baseEnv.YIRU_GIT_COMMIT_TRAILER = YIRU_GIT_COMMIT_TRAILER
  baseEnv.YIRU_GH_PR_FOOTER = YIRU_GH_FOOTER
  if (shellFamily === 'posix') {
    baseEnv.YIRU_ATTRIBUTION_SHIM_DIR = posixDir
  } else {
    delete baseEnv.YIRU_ATTRIBUTION_SHIM_DIR
  }

  if (platform === 'win32') {
    if (resolvedGit) {
      baseEnv.YIRU_REAL_GIT = resolvedGit
    }
    if (resolvedGh) {
      baseEnv.YIRU_REAL_GH = resolvedGh
    }
  }
}

function clearTerminalAttributionEnv(
  baseEnv: Record<string, string>,
  platform: NodeJS.Platform
): void {
  for (const key of ATTRIBUTION_ENV_KEYS) {
    delete baseEnv[key]
  }
  const pathDelimiter = platform === 'win32' ? ';' : ':'
  const cleanedPath = stripAttributionPathEntries(baseEnv.PATH ?? '', pathDelimiter)
  if (cleanedPath) {
    baseEnv.PATH = cleanedPath
  } else {
    delete baseEnv.PATH
  }
}
