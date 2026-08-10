import { createRequire } from 'node:module'

import type {
  RuntimeOrpcClient,
  RuntimeOrpcFacade,
  RuntimeOrpcLink,
  RuntimeOrpcSocketLike
} from './orpc-client-types'

const requireFromCli = createRequire(__filename)
const runtimeOrpcFacade = loadRuntimeOrpcFacade()
const runtimeContractModule: unknown = requireFromCli('@yiru/runtime-protocol/contract')

if (!isRecord(runtimeContractModule) || !('runtimeContract' in runtimeContractModule)) {
  throw new Error('The bundled runtime contract is invalid')
}

export const runtimeContractValue: unknown = runtimeContractModule.runtimeContract

export function createRuntimeOrpcClient(link: RuntimeOrpcLink): RuntimeOrpcClient {
  return runtimeOrpcFacade.createClient(link)
}

export function createRuntimeOrpcSocketLink(
  socket: RuntimeOrpcSocketLike,
  headers: Record<string, string>
): RuntimeOrpcLink {
  return runtimeOrpcFacade.createSocketLink(socket, headers)
}

function loadRuntimeOrpcFacade(): RuntimeOrpcFacade {
  const value: unknown = requireFromCli('./orpc-client-bundle.cjs')
  if (!isRuntimeOrpcFacade(value)) {
    throw new Error('The bundled oRPC CLI facade is invalid')
  }
  return value
}

function isRuntimeOrpcFacade(value: unknown): value is RuntimeOrpcFacade {
  return (
    typeof value === 'object' &&
    value !== null &&
    'createClient' in value &&
    typeof value.createClient === 'function' &&
    'createSocketLink' in value &&
    typeof value.createSocketLink === 'function'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
