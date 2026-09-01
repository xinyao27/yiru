import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'

export type WslPathInfo = {
  distro: string
  linuxPath: string
}

export function parseWslPath(windowsPath: string): WslPathInfo | null {
  if (process.platform !== 'win32') {
    return null
  }
  return parseWslUncPath(windowsPath)
}

export function isWslPath(path: string): boolean {
  return parseWslPath(path) !== null
}

export function toLinuxPath(windowsPath: string): string {
  const info = parseWslPath(windowsPath)
  if (info) {
    return info.linuxPath
  }
  const driveMatch = windowsPath.match(/^([A-Za-z]):[/\\](.*)$/)
  if (!driveMatch) {
    return windowsPath
  }
  const driveLetter = driveMatch[1].toLowerCase()
  const rest = driveMatch[2].replace(/\\/g, '/')
  return `/mnt/${driveLetter}/${rest}`
}

export function toWindowsWslPath(linuxPath: string, distro: string): string {
  const mntMatch = linuxPath.match(/^\/mnt\/([a-z])(\/.*)?$/)
  if (mntMatch) {
    const driveLetter = mntMatch[1].toUpperCase()
    const rest = (mntMatch[2] || '').replace(/\//g, '\\')
    return `${driveLetter}:${rest || '\\'}`
  }
  return `\\\\wsl.localhost\\${distro}${linuxPath.replace(/\//g, '\\')}`
}
