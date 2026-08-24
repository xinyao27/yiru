import type { AdvertisedUrl, HostKind } from './advertised-url-types'

const URL_CANDIDATE_LIMIT = 2048
const ESCAPE = '\\x1b'
const OSC_PATTERN = new RegExp(`${ESCAPE}\\][^\\x07${ESCAPE}]*(?:\\x07|${ESCAPE}\\\\)`, 'g')
const CURSOR_MOVE_PATTERN = new RegExp(`${ESCAPE}\\[[0-?]*[ -/]*[CDGHf]`, 'g')
const CSI_PATTERN = new RegExp(`${ESCAPE}\\[[0-?]*[ -/]*[@-~]`, 'g')
const SINGLE_ESC_PATTERN = new RegExp(`${ESCAPE}[@-_]`, 'g')
const URL_CANDIDATE_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi

export function stripTerminalControls(text: string): string {
  const escapeStripped = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(OSC_PATTERN, '')
    // Why: cursor moves can skip cells already on screen. The guard makes a
    // candidate crossing the skipped region invalid instead of fusing text.
    .replace(CURSOR_MOVE_PATTERN, '[')
    .replace(CSI_PATTERN, '')
    .replace(SINGLE_ESC_PATTERN, '')
  let cleaned = ''
  for (const character of escapeStripped) {
    const code = character.charCodeAt(0)
    if (!((code >= 0 && code <= 8) || (code >= 11 && code <= 31) || code === 127)) {
      cleaned += character
    }
  }
  return cleaned
}

export function extractUrlCandidates(cleaned: string): URL[] {
  const results: URL[] = []
  for (const match of cleaned.matchAll(URL_CANDIDATE_PATTERN)) {
    let candidate = match[0]
    if (candidate.length > URL_CANDIDATE_LIMIT) {
      continue
    }
    while (candidate.length > 0 && /[.,;:!?)\]}>'"`]/.test(candidate.slice(-1))) {
      candidate = candidate.slice(0, -1)
    }
    try {
      const url = new URL(candidate)
      if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname) {
        results.push(url)
      }
    } catch {
      // Candidate-shaped terminal text is allowed to be an invalid URL.
    }
  }
  return results
}

export function classifyHost(hostname: string): HostKind {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1') {
    return 'loopback'
  }
  if (isIpv4(lower)) {
    return isPrivateIpv4(lower) ? 'private-ip' : 'public-ip'
  }
  if (isIpv6(lower)) {
    return isPrivateIpv6(lower) ? 'private-ip' : 'public-ip'
  }
  return 'custom'
}

export function createAdvertisedUrl(
  url: URL,
  ptyId: string,
  timestamp: number
): AdvertisedUrl | null {
  const protocol = url.protocol === 'https:' ? 'https' : 'http'
  const port = url.port ? Number(url.port) : protocol === 'https' ? 443 : 80
  if (!Number.isFinite(port) || port <= 0 || port > 65535 || isUnspecifiedHost(url.hostname)) {
    return null
  }
  const origin = `${protocol}://${formatHostForOrigin(url)}${
    isDefaultPort(protocol, port) ? '' : `:${port}`
  }`
  return {
    origin,
    host: url.hostname,
    hostKind: classifyHost(url.hostname),
    protocol,
    port,
    ptyId,
    lastSeenAt: timestamp
  }
}

export function shouldReplaceAdvertisedUrl(
  existing: AdvertisedUrl,
  candidate: AdvertisedUrl
): boolean {
  const oldScore = hostKindScore(existing.hostKind)
  const newScore = hostKindScore(candidate.hostKind)
  if (newScore !== oldScore) {
    return newScore > oldScore
  }
  if (existing.protocol !== candidate.protocol) {
    return candidate.protocol === 'https'
  }
  return candidate.lastSeenAt >= existing.lastSeenAt
}

function hostKindScore(kind: HostKind): number {
  switch (kind) {
    case 'custom':
      return 3
    case 'loopback':
      return 2
    case 'private-ip':
      return 1
    case 'public-ip':
      return 0
  }
}

function isIpv4(value: string): boolean {
  const parts = value.split('.')
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function isPrivateIpv4(value: string): boolean {
  const [first, second] = value.split('.').map(Number)
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  )
}

function isIpv6(value: string): boolean {
  return value.includes(':') && /^[0-9a-f:]+$/.test(value)
}

function isPrivateIpv6(value: string): boolean {
  if (value.startsWith('fc') || value.startsWith('fd')) {
    return true
  }
  const firstHextet = Number.parseInt(value.split(':', 1)[0], 16)
  return Number.isFinite(firstHextet) && (firstHextet & 0xffc0) === 0xfe80
}

function isUnspecifiedHost(hostname: string): boolean {
  const stripped = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return stripped === '0.0.0.0' || stripped === '::' || stripped === '*'
}

function isDefaultPort(protocol: 'http' | 'https', port: number): boolean {
  return (protocol === 'http' && port === 80) || (protocol === 'https' && port === 443)
}

function formatHostForOrigin(url: URL): string {
  if (url.hostname.startsWith('[') && url.hostname.endsWith(']')) {
    return url.hostname
  }
  return url.hostname.includes(':') ? `[${url.hostname}]` : url.hostname
}
