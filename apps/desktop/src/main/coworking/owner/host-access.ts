import { createHash } from 'node:crypto'

import {
  CoworkingHostAccessRequestResultSchema,
  type CoworkingHostAccessRequestResult
} from '~shared/coworking/host-access-contract'
import type { CoworkingRequestHostAccessResult } from '~shared/coworking/ipc-contract'
import type { PairingOffer } from '~shared/pairing'
import { upsertEnvironmentFromPairingOffer } from '~shared/runtime-environment-store'
import { redactRuntimeEnvironment } from '~shared/runtime-environments'

import type { CoworkingOwnerRecord } from './record'

const HOST_ACCESS_REQUEST_TIMEOUT_MS = 15 * 60 * 1_000

export async function requestCoworkingHostAccess(
  record: CoworkingOwnerRecord | undefined,
  userDataPath: string
): Promise<CoworkingRequestHostAccessResult> {
  if (!record?.connection || record.status !== 'connected') {
    throw new Error('resource_unavailable')
  }
  const rawResult = await record.connection.request<CoworkingHostAccessRequestResult>(
    'host.request',
    {},
    { mutation: true, timeoutMs: HOST_ACCESS_REQUEST_TIMEOUT_MS }
  )
  const result = CoworkingHostAccessRequestResultSchema.parse(rawResult)
  if (result.status !== 'granted') {
    return result
  }
  const environment = upsertEnvironmentFromPairingOffer(userDataPath, {
    id: coworkingRuntimeEnvironmentId(record.descriptor.tailnetNodeId),
    name: record.descriptor.nodeDisplayName,
    offer: pairingOfferAtAddress(result.offer, record.descriptor.address)
  })
  return { status: 'granted', environment: redactRuntimeEnvironment(environment) }
}

function coworkingRuntimeEnvironmentId(nodeId: string): string {
  return `coworking-${createHash('sha256').update(nodeId).digest('hex').slice(0, 32)}`
}

function pairingOfferAtAddress(offer: PairingOffer, address: string): PairingOffer {
  const endpoint = new URL(offer.endpoint)
  endpoint.hostname = address.includes(':') ? `[${address.replace(/^\[|\]$/g, '')}]` : address
  return { ...offer, endpoint: endpoint.toString() }
}
