import { isIP } from 'node:net'
import type { TailnetNode, TailnetPrincipal, TailnetSnapshot } from './tailnet-control'
import { TailnetControlError } from './tailnet-control'

export function projectTailnetSnapshot(value: unknown, capturedAt: number): TailnetSnapshot {
  const root = asRecord(value)
  const self = projectNode(root.Self, root.User)
  if (!self) {
    throw new TailnetControlError('unsupported-output')
  }

  const byNodeId = new Map<string, TailnetNode>()
  for (const candidate of recordValues(root.Peer)) {
    const peer = projectNode(candidate, root.User)
    if (!peer || peer.nodeId === self.nodeId) {
      continue
    }
    const existing = byNodeId.get(peer.nodeId)
    byNodeId.set(peer.nodeId, existing ? mergeNodes(existing, peer) : peer)
  }
  return { self, peers: [...byNodeId.values()], capturedAt }
}

export function projectTailnetPrincipal(
  value: unknown,
  sourceAddress: string
): TailnetPrincipal | null {
  const root = asRecord(value)
  const node = asRecord(root.Node)
  const nodeId = readNodeId(node)
  const normalizedSource = normalizeTailnetIp(sourceAddress)
  if (!nodeId || !normalizedSource) {
    return null
  }
  const user = asRecord(root.UserProfile)
  return {
    nodeId,
    sourceAddress: normalizedSource,
    userDisplayName: readDisplayName(user, 'Unknown Tailnet user'),
    nodeDisplayName: readNodeDisplayName(node, normalizedSource)
  }
}

export function normalizeTailnetIp(value: string): string | null {
  let candidate = value.trim()
  const slash = candidate.indexOf('/')
  if (slash !== -1) {
    candidate = candidate.slice(0, slash)
  }
  if (candidate.startsWith('[') && candidate.endsWith(']')) {
    candidate = candidate.slice(1, -1)
  }
  const zone = candidate.indexOf('%')
  if (zone !== -1) {
    candidate = candidate.slice(0, zone)
  }
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(candidate)
  if (mapped && isIP(mapped[1]) === 4) {
    return mapped[1]
  }
  return isIP(candidate) === 0 ? null : candidate.toLowerCase()
}

function projectNode(value: unknown, users: unknown): TailnetNode | null {
  const node = asRecord(value)
  const nodeId = readNodeId(node)
  const addresses = readStringArray(node.TailscaleIPs ?? node.Addresses)
    .map(normalizeTailnetIp)
    .filter((address): address is string => address !== null)
  if (!nodeId || addresses.length === 0) {
    return null
  }
  const user = findUser(users, node.UserID)
  return {
    nodeId,
    addresses: [...new Set(addresses)],
    userDisplayName: readDisplayName(user, 'Unknown Tailnet user'),
    nodeDisplayName: readNodeDisplayName(node, addresses[0]),
    online: typeof node.Online === 'boolean' ? node.Online : null
  }
}

function readNodeId(node: Record<string, unknown>): string | null {
  for (const candidate of [node.StableID, node.ID]) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }
  return null
}

function readNodeDisplayName(node: Record<string, unknown>, fallback: string): string {
  for (const candidate of [node.HostName, node.Name, node.DNSName]) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate.replace(/\.$/, '')
    }
  }
  return fallback
}

function readDisplayName(user: Record<string, unknown>, fallback: string): string {
  for (const candidate of [user.DisplayName, user.LoginName]) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }
  return fallback
}

function findUser(users: unknown, userId: unknown): Record<string, unknown> {
  const record = asRecord(users)
  if (typeof userId !== 'string' && typeof userId !== 'number') {
    return {}
  }
  return asRecord(record[String(userId)])
}

function mergeNodes(left: TailnetNode, right: TailnetNode): TailnetNode {
  return {
    ...left,
    addresses: [...new Set([...left.addresses, ...right.addresses])],
    online: left.online === true || right.online === true ? true : (left.online ?? right.online)
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function recordValues(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value
  }
  return Object.values(asRecord(value))
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
