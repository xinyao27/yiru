import { createHash } from 'node:crypto'
import { request } from 'node:http'
import { generateKeyPair, publicKeyFromBase64, publicKeyToBase64 } from '../../shared/e2ee-crypto'
import type { SpoolProbeResponse } from '../../shared/spool/spool-wire-contract'
import {
  SPOOL_INGRESS_PORT,
  SPOOL_PROBE_PATH,
  SPOOL_SUPPORTED_PROTOCOL_VERSIONS
} from '../../shared/spool/spool-wire-contract'

const PROBE_TIMEOUT_MS = 3_000
const MAX_PROBE_RESPONSE_BYTES = 16 * 1024

export type SpoolPeerAdmission = {
  address: string
  clientPublicKeyB64: string
  clientSecretKey: Uint8Array
  response: SpoolProbeResponse
}

export type SpoolProbeClient = {
  probe(address: string): Promise<SpoolPeerAdmission>
}

export class HttpSpoolProbeClient implements SpoolProbeClient {
  async probe(address: string): Promise<SpoolPeerAdmission> {
    const clientKeypair = generateKeyPair()
    const clientPublicKeyB64 = publicKeyToBase64(clientKeypair.publicKey)
    const response = await postProbe(address, clientPublicKeyB64)
    validateProbeResponse(response)
    return {
      address,
      clientPublicKeyB64,
      clientSecretKey: clientKeypair.secretKey,
      response
    }
  }
}

function postProbe(address: string, clientPublicKeyB64: string): Promise<SpoolProbeResponse> {
  const body = JSON.stringify({
    protocolVersions: SPOOL_SUPPORTED_PROTOCOL_VERSIONS,
    clientPublicKeyB64
  })
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: address,
        port: SPOOL_INGRESS_PORT,
        path: SPOOL_PROBE_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Connection: 'close'
        },
        timeout: PROBE_TIMEOUT_MS
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume()
          reject(new Error('spool_probe_unavailable'))
          return
        }
        const chunks: Buffer[] = []
        let received = 0
        response.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (received > MAX_PROBE_RESPONSE_BYTES) {
            response.destroy(new Error('spool_probe_response_too_large'))
            return
          }
          chunks.push(chunk)
        })
        response.once('error', reject)
        response.once('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as SpoolProbeResponse)
          } catch {
            reject(new Error('spool_probe_invalid_response'))
          }
        })
      }
    )
    req.once('timeout', () => req.destroy(new Error('spool_probe_timeout')))
    req.once('error', reject)
    req.end(body)
  })
}

function validateProbeResponse(value: unknown): asserts value is SpoolProbeResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('spool_probe_invalid_response')
  }
  const response = value as Record<string, unknown>
  if (
    !hasOnlyKeys(response, [
      'protocolVersion',
      'ownerRuntimeId',
      'ownerPublicKeyB64',
      'ownerKeyFingerprint',
      'orcaVersion',
      'osFamily',
      'ticket',
      'ticketExpiresAt'
    ]) ||
    !SPOOL_SUPPORTED_PROTOCOL_VERSIONS.includes(
      response.protocolVersion as (typeof SPOOL_SUPPORTED_PROTOCOL_VERSIONS)[number]
    ) ||
    !isBoundedText(response.ownerRuntimeId, 2_048) ||
    !isBoundedText(response.orcaVersion, 128) ||
    (response.osFamily !== 'macos' &&
      response.osFamily !== 'linux' &&
      response.osFamily !== 'windows') ||
    typeof response.ownerPublicKeyB64 !== 'string' ||
    typeof response.ownerKeyFingerprint !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(response.ownerKeyFingerprint) ||
    typeof response.ticket !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(response.ticket) ||
    !Number.isSafeInteger(response.ticketExpiresAt) ||
    Number(response.ticketExpiresAt) <= Date.now()
  ) {
    throw new Error('spool_probe_invalid_response')
  }
  const ownerPublicKey = publicKeyFromBase64(response.ownerPublicKeyB64 as string)
  const fingerprint = createHash('sha256').update(ownerPublicKey).digest('base64url')
  if (fingerprint !== response.ownerKeyFingerprint) {
    throw new Error('spool_probe_key_mismatch')
  }
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !hasControlCharacter(value)
  )
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      return true
    }
  }
  return false
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return (
    Object.keys(record).length === keys.length &&
    Object.keys(record).every((key) => allowed.has(key))
  )
}
