import path from 'node:path'

import { relativePathInsideRoot } from '../shared/cross-platform-path'

export type LanguageServerPathFlavor = 'posix' | 'windows'

export function languageServerFileUri(
  filePath: string,
  pathFlavor: LanguageServerPathFlavor
): string {
  if (pathFlavor === 'posix') {
    if (!filePath.startsWith('/')) {
      throw new Error('Language server requires an absolute host path.')
    }
    const url = new URL('file:///')
    url.pathname = encodeUriPath(filePath)
    return url.toString()
  }
  const normalized = filePath.replace(/\\/g, '/')
  const unc = normalized.match(/^\/\/([^/]+)\/([\s\S]+)$/)
  if (unc) {
    const url = new URL('file:///')
    url.hostname = unc[1]
    url.pathname = encodeUriPath(`/${unc[2]}`)
    return url.toString()
  }
  if (!/^[A-Za-z]:\//.test(normalized)) {
    throw new Error('Language server requires an absolute Windows host path.')
  }
  const url = new URL('file:///')
  url.pathname = encodeUriPath(`/${normalized}`).replace(/^\/[A-Za-z]%3A/i, (drive) =>
    drive.replace('%3A', ':').replace('%3a', ':')
  )
  return url.toString()
}

export function languageServerFilePath(uri: string, pathFlavor: LanguageServerPathFlavor): string {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    throw new Error('Language server returned an unsupported document URI.')
  }
  if (parsed.protocol !== 'file:') {
    throw new Error('Language server returned an unsupported document URI.')
  }
  const decodedPath = decodeURIComponent(parsed.pathname)
  if (pathFlavor === 'posix') {
    if (parsed.hostname && parsed.hostname !== 'localhost') {
      throw new Error('Language server returned an unsupported document URI.')
    }
    return decodedPath
  }
  if (parsed.hostname && parsed.hostname !== 'localhost') {
    return `\\\\${parsed.hostname}${decodedPath.replace(/\//g, '\\')}`
  }
  const drivePath = decodedPath.replace(/^\/([A-Za-z]:\/)/, '$1')
  if (!/^[A-Za-z]:\//.test(drivePath)) {
    throw new Error('Language server returned an unsupported document URI.')
  }
  return drivePath.replace(/\//g, '\\')
}

export function authorizedLanguageServerRelativePath(
  canonicalRoot: string,
  canonicalFile: string
): string {
  const relative = relativePathInsideRoot(canonicalRoot, canonicalFile)
  if (relative === null) {
    throw new Error('Language server document is outside the owning workspace.')
  }
  return relative.replace(/\\/g, '/')
}

function encodeUriPath(value: string): string {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function languageServerDisplayPath(
  displayRoot: string,
  relativePath: string,
  pathFlavor: LanguageServerPathFlavor,
  displayUsesWslUnc = false
): string {
  if (displayUsesWslUnc || pathFlavor === 'windows') {
    const joined = path.win32.join(displayRoot, ...relativePath.split('/'))
    return displayRoot.includes('/') && !displayRoot.includes('\\')
      ? joined.replace(/\\/g, '/')
      : joined
  }
  return path.posix.join(displayRoot, ...relativePath.split('/'))
}
