import { createHash } from 'node:crypto'

import type {
  RuntimeOrchestrationEnvelope,
  RuntimeRpcResponse
} from '@yiru/runtime-protocol/rpc-envelope'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '~shared/runtime-method-contract'

export type OrchestrationWorkerServer = {
  environmentId: string
  name: string
  peerFingerprint: string
}

// Why: mirrors `callRuntimeEnvironment`'s own generic signature
// (`environment-transport-routing.ts`) so a caller can pass a real
// `RuntimeMethodContract` instead of a bare method string — the slice 79
// oRPC-negotiation gate only fires for the contract-object branch. The bare
// string branch stays for the leaves whose envelope (`orchestrationRequestId`)
// has no oRPC carrier yet.
export type OrchestrationEnvironmentTransport = {
  resolve(selector: string): OrchestrationWorkerServer
  call<TContract extends string | RuntimeMethodContract>(
    selector: string,
    contract: TContract,
    params: TContract extends RuntimeMethodContract ? RuntimeMethodParams<TContract> : unknown,
    timeoutMs?: number,
    envelope?: RuntimeOrchestrationEnvelope
  ): Promise<
    RuntimeRpcResponse<
      TContract extends RuntimeMethodContract ? RuntimeMethodResult<TContract> : unknown
    >
  >
}

export function fingerprintOrchestrationPeer(publicKeyB64: string): string {
  return createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest('base64url')
}
