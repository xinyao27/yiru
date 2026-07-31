import { ORCHESTRATION_CONTRACT_VERSION } from '@yiru/runtime-protocol/capabilities'
import type { RuntimeOrchestrationEnvelope } from '@yiru/runtime-protocol/rpc-envelope'
import type { RpcResponse } from '~main/runtime/rpc/core'
import type { RpcDispatcher } from '~main/runtime/rpc/dispatcher'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '~shared/runtime-method-contract'

type RpcCallResult<TContract extends string | RuntimeMethodContract> =
  TContract extends RuntimeMethodContract ? RuntimeMethodResult<TContract> : unknown

export async function callRemoteRpc<TContract extends string | RuntimeMethodContract>(
  dispatcher: RpcDispatcher,
  contract: TContract,
  params?: TContract extends RuntimeMethodContract
    ? RuntimeMethodParams<TContract>
    : Record<string, unknown>,
  envelope?: RuntimeOrchestrationEnvelope
): Promise<RpcResponse<RpcCallResult<TContract>>> {
  const method = typeof contract === 'string' ? contract : contract.name
  return (await dispatcher.dispatch({
    id: `remote-cli-${Date.now()}`,
    authToken: 'remote-cli',
    method,
    params: params as Record<string, unknown> | undefined,
    orchestrationCapability: envelope?.orchestrationCapability,
    orchestrationContractVersion: method.startsWith('orchestration.')
      ? ORCHESTRATION_CONTRACT_VERSION
      : undefined,
    orchestrationRequestId: envelope?.orchestrationRequestId
  })) as RpcResponse<RpcCallResult<TContract>>
}
