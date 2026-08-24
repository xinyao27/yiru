import { getProcessOutputFields } from '~shared/process-output-field-scanner'

import type { RawListeningPort } from './local-port-types'

export function parseLsofListeningOutput(output: string): RawListeningPort[] {
  const ports: RawListeningPort[] = []
  let currentPid: number | undefined
  let currentProcessName: string | undefined
  for (const line of output.split('\n')) {
    if (!line) {
      continue
    }
    const tag = line[0]
    const value = line.slice(1)
    if (tag === 'p') {
      const pid = Number.parseInt(value, 10)
      currentPid = Number.isFinite(pid) ? pid : undefined
      currentProcessName = undefined
    } else if (tag === 'c') {
      currentProcessName = value
    } else if (tag === 'n') {
      const parsed = parseAddressWithPort(value)
      if (parsed) {
        ports.push({ pid: currentPid, processName: currentProcessName, ...parsed })
      }
    }
  }
  return dedupeRawPorts(ports)
}

export function parseNetstatListeningOutput(output: string): RawListeningPort[] {
  const ports: RawListeningPort[] = []
  for (const line of output.split('\n')) {
    const fields = getProcessOutputFields(line, 6)
    if (fields[0]?.toUpperCase() !== 'TCP') {
      continue
    }
    const stateIndex = fields.findIndex((field) => field.toUpperCase() === 'LISTENING')
    if (stateIndex < 2) {
      continue
    }
    const parsed = parseAddressWithPort(fields[1])
    const pid = Number.parseInt(fields[stateIndex + 1] ?? '', 10)
    if (parsed) {
      ports.push({ ...parsed, pid: Number.isFinite(pid) ? pid : undefined })
    }
  }
  return dedupeRawPorts(ports)
}

export function parseProcNetTcp(content: string): { host: string; port: number; inode: number }[] {
  const results: { host: string; port: number; inode: number }[] = []
  const lines = content.split('\n')
  for (let index = 1; index < lines.length; index += 1) {
    const fields = getProcessOutputFields(lines[index], 10)
    if (fields.length < 10 || fields[3] !== '0A') {
      continue
    }
    const parsed = parseProcAddress(fields[1])
    const inode = Number.parseInt(fields[9], 10)
    if (parsed && Number.isFinite(inode) && inode !== 0) {
      results.push({ ...parsed, inode })
    }
  }
  return results
}

export function connectHostForBindHost(host: string): string {
  return host === '*' || host === '0.0.0.0' || host === '::' ? 'localhost' : host
}

export function dedupeRawPorts(ports: RawListeningPort[]): RawListeningPort[] {
  const seen = new Set<string>()
  const result: RawListeningPort[] = []
  for (const port of ports) {
    const key = `${connectHostForBindHost(port.host)}:${port.port}:${port.pid ?? 'unknown'}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(port)
    }
  }
  return result
}

function parseAddressWithPort(value: string): { host: string; port: number } | null {
  const trimmed = value.trim().replace(/\s+\(LISTEN\)$/i, '')
  const bracketed = trimmed.match(/^\[([^\]]+)\]:(\d+)$/)
  if (bracketed) {
    return { host: bracketed[1], port: Number.parseInt(bracketed[2], 10) }
  }
  const match = trimmed.match(/^(.+):(\d+)$/)
  if (!match) {
    return null
  }
  const port = Number.parseInt(match[2], 10)
  return Number.isFinite(port) && port > 0 && port <= 65535 ? { host: match[1], port } : null
}

function parseProcAddress(hexAddress: string): { host: string; port: number } | null {
  const [addrHex, portHex] = hexAddress.split(':')
  const port = Number.parseInt(portHex, 16)
  if (!Number.isFinite(port) || port === 0) {
    return null
  }
  if (addrHex.length === 8) {
    const bytes = [6, 4, 2, 0].map((index) => Number.parseInt(addrHex.slice(index, index + 2), 16))
    return { host: bytes.join('.'), port }
  }
  if (addrHex.length !== 32) {
    return null
  }
  if (addrHex === '00000000000000000000000000000000') {
    return { host: '::', port }
  }
  if (addrHex === '00000000000000000000000001000000') {
    return { host: '::1', port }
  }
  return { host: formatIPv6Address(addrHex), port }
}

function formatIPv6Address(hex: string): string {
  const groups: string[] = []
  for (let index = 0; index < 32; index += 8) {
    const chunk = hex.slice(index, index + 8)
    const reversed = chunk.slice(6, 8) + chunk.slice(4, 6) + chunk.slice(2, 4) + chunk.slice(0, 2)
    groups.push(reversed.slice(0, 4), reversed.slice(4, 8))
  }
  return groups.map((group) => group.replace(/^0+/, '') || '0').join(':')
}
