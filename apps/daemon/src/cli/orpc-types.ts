import type { ContractRouterClient, runtimeContract } from '@yiru/runtime-protocol/contract'
import type { RuntimeOrchestrationEnvelope } from '@yiru/runtime-protocol/rpc-envelope'

export type RuntimeOrpcResponseMetadata = {
  requestId: string
  runtimeId: string
}

export type RuntimeOrpcClientContext = RuntimeOrchestrationEnvelope & {
  timeoutMs?: number
  onResponse?: (metadata: RuntimeOrpcResponseMetadata) => void
}

export type RuntimeOrpcClient = ContractRouterClient<
  typeof runtimeContract,
  RuntimeOrpcClientContext
>

export type RuntimeOrpcLinkOptions = {
  signal?: AbortSignal
  context: RuntimeOrpcClientContext
}

export type RuntimeOrpcLink = {
  call: (
    path: readonly string[],
    input: unknown,
    options: RuntimeOrpcLinkOptions
  ) => Promise<unknown>
}
