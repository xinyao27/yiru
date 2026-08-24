import { existsSync } from 'node:fs'
import { win32 as pathWin32 } from 'node:path'

export function stripAttributionPathEntries(pathValue: string, pathDelimiter: string): string {
  return pathValue
    .split(pathDelimiter)
    .filter((entry) => {
      const normalized = entry.replace(/\\/g, '/').toLowerCase()
      return !normalized.includes('/yiru-terminal-attribution/')
    })
    .join(pathDelimiter)
}

export function resolveWindowsExecutable(command: string, pathValue: string): string | null {
  const pathExt = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((ext) => ext.toLowerCase())
  const searchDirs = pathValue.split(';').filter(Boolean)

  for (const dir of searchDirs) {
    for (const ext of pathExt) {
      const candidate = pathWin32.join(dir, `${command}${ext}`)
      if (existsSync(candidate)) {
        return candidate
      }
    }
    const bareCandidate = pathWin32.join(dir, command)
    if (existsSync(bareCandidate)) {
      return bareCandidate
    }
  }

  return null
}
