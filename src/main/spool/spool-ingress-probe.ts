import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SpoolTicketAuthority } from './spool-ticket-authority'
import type { TailnetControl } from './tailnet-control'
import type { SpoolE2EEKeypair } from './spool-e2ee-keypair'
import type { SpoolOsFamily, SpoolProbeRequest } from '../../shared/spool/spool-wire-contract'
import {
  SPOOL_PROTOCOL_VERSION,
  SPOOL_SUPPORTED_PROTOCOL_VERSIONS
} from '../../shared/spool/spool-wire-contract'
import { normalizeTailnetIp } from './tailscale-json-projection'

const MAX_PROBE_BODY_BYTES = 4 * 1024
const MAX_CONCURRENT_PROBES = 32
const MAX_PROBES_PER_SOURCE_PER_MINUTE = 30

export type SpoolProbeServiceOptions = {
  tailnet: TailnetControl
  tickets: SpoolTicketAuthority
  keypair: SpoolE2EEKeypair
  ownerRuntimeId: string
  orcaVersion: string
  osFamily: SpoolOsFamily
  now?: () => number
}

export class SpoolProbeService {
  private readonly attemptsBySource = new Map<string, number[]>()
  private activeProbes = 0
  private readonly now: () => number

  constructor(private readonly options: SpoolProbeServiceOptions) {
    this.now = options.now ?? Date.now
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.origin || hasForwardedAddressHeader(request)) {
      writeJson(response, 403, { error: 'forbidden' })
      return
    }
    if (this.activeProbes >= MAX_CONCURRENT_PROBES) {
      writeJson(response, 503, { error: 'resource_busy' })
      return
    }
    const sourceAddress = normalizeTailnetIp(request.socket.remoteAddress ?? '')
    if (!sourceAddress || !this.admitSource(sourceAddress)) {
      writeJson(response, 429, { error: 'rate_limited' })
      return
    }

    this.activeProbes++
    try {
      const principal = await this.options.tailnet.identifySource({
        host: sourceAddress,
        port: request.socket.remotePort ?? null
      })
      if (!principal) {
        writeJson(response, 403, { error: 'forbidden' })
        return
      }
      const body = await readProbeBody(request)
      const protocolVersion = selectProtocolVersion(body.protocolVersions)
      if (!protocolVersion) {
        writeJson(response, 426, {
          error: 'unsupported_protocol',
          supportedProtocolVersions: SPOOL_SUPPORTED_PROTOCOL_VERSIONS
        })
        return
      }
      const ticket = this.options.tickets.issue({
        requester: principal,
        clientPublicKeyB64: body.clientPublicKeyB64,
        ownerRuntimeId: this.options.ownerRuntimeId,
        ownerKeyFingerprint: this.options.keypair.fingerprint,
        protocolVersion
      })
      writeJson(response, 200, {
        protocolVersion,
        ownerRuntimeId: this.options.ownerRuntimeId,
        ownerPublicKeyB64: this.options.keypair.publicKeyB64,
        ownerKeyFingerprint: this.options.keypair.fingerprint,
        orcaVersion: this.options.orcaVersion,
        osFamily: this.options.osFamily,
        ticket: ticket.value,
        ticketExpiresAt: ticket.expiresAt
      })
    } catch (error) {
      const code = error instanceof ProbeBodyError ? error.code : 'probe_failed'
      writeJson(response, code === 'invalid_request' ? 400 : 503, { error: code })
    } finally {
      this.activeProbes--
    }
  }

  private admitSource(sourceAddress: string): boolean {
    const cutoff = this.now() - 60_000
    const recent = (this.attemptsBySource.get(sourceAddress) ?? []).filter(
      (timestamp) => timestamp > cutoff
    )
    if (recent.length >= MAX_PROBES_PER_SOURCE_PER_MINUTE) {
      this.attemptsBySource.set(sourceAddress, recent)
      return false
    }
    recent.push(this.now())
    this.attemptsBySource.set(sourceAddress, recent)
    return true
  }
}

class ProbeBodyError extends Error {
  constructor(readonly code: 'invalid_request' | 'request_too_large') {
    super(code)
  }
}

async function readProbeBody(request: IncomingMessage): Promise<SpoolProbeRequest> {
  const declaredLength = Number(request.headers['content-length'] ?? 0)
  if (declaredLength > MAX_PROBE_BODY_BYTES) {
    throw new ProbeBodyError('request_too_large')
  }
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    received += bytes.length
    if (received > MAX_PROBE_BODY_BYTES) {
      throw new ProbeBodyError('request_too_large')
    }
    chunks.push(bytes)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  } catch {
    throw new ProbeBodyError('invalid_request')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ProbeBodyError('invalid_request')
  }
  const record = parsed as Record<string, unknown>
  if (
    !hasOnlyKeys(record, ['protocolVersions', 'clientPublicKeyB64']) ||
    !Array.isArray(record.protocolVersions) ||
    record.protocolVersions.length === 0 ||
    record.protocolVersions.length > 8 ||
    !record.protocolVersions.every(Number.isSafeInteger) ||
    typeof record.clientPublicKeyB64 !== 'string' ||
    record.clientPublicKeyB64.length > 128
  ) {
    throw new ProbeBodyError('invalid_request')
  }
  return {
    protocolVersions: record.protocolVersions as number[],
    clientPublicKeyB64: record.clientPublicKeyB64
  }
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return (
    Object.keys(record).length === keys.length &&
    Object.keys(record).every((key) => allowed.has(key))
  )
}

function selectProtocolVersion(versions: readonly number[]): number | null {
  return versions.includes(SPOOL_PROTOCOL_VERSION) ? SPOOL_PROTOCOL_VERSION : null
}

function hasForwardedAddressHeader(request: IncomingMessage): boolean {
  return Boolean(
    request.headers.forwarded ||
    request.headers['x-forwarded-for'] ||
    request.headers['x-real-ip'] ||
    request.headers['x-forwarded-host']
  )
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent || response.destroyed) {
    return
  }
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  })
  response.end(JSON.stringify(body))
}
