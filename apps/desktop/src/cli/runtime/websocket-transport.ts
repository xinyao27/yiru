import type { PairingOffer } from '../../shared/pairing'
import {
  RemoteRuntimeClientError,
  sendRemoteRuntimeRequest
} from '../../shared/remote-runtime-client'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '../../shared/runtime-method-contract'
import { RuntimeClientError, type RuntimeRpcResponse } from './types'

export function sendWebSocketRequest<TContract extends RuntimeMethodContract>(
  pairing: PairingOffer,
  contract: TContract,
  params: RuntimeMethodParams<TContract>,
  timeoutMs: number
): Promise<RuntimeRpcResponse<RuntimeMethodResult<TContract>>>
export function sendWebSocketRequest<TResult>(
  pairing: PairingOffer,
  method: string,
  params: unknown,
  timeoutMs: number
): Promise<RuntimeRpcResponse<TResult>>
export async function sendWebSocketRequest<TResult>(
  pairing: PairingOffer,
  contract: string | RuntimeMethodContract,
  params: unknown,
  timeoutMs: number
): Promise<RuntimeRpcResponse<TResult>> {
  try {
    return await sendRemoteRuntimeRequest<TResult>(
      pairing,
      typeof contract === 'string' ? contract : contract.name,
      params,
      timeoutMs
    )
  } catch (error) {
    if (error instanceof RemoteRuntimeClientError) {
      throw new RuntimeClientError(error.code, error.message)
    }
    throw error
  }
}
