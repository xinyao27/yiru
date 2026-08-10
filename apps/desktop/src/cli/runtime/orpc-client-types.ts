import type { ContractRouterClient, runtimeContract } from '@yiru/runtime-protocol/contract' with {
  'resolution-mode': 'require'
}
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

export type RuntimeOrpcProcedure<TInput, TOutput> = (
  input: TInput,
  options: RuntimeOrpcLinkOptions
) => Promise<TOutput>

export type RuntimeOrpcSocketEvent = {
  data?: string | ArrayBuffer
}

export type RuntimeOrpcSocketEventListener = (event: RuntimeOrpcSocketEvent) => void

export type RuntimeOrpcSocketLike = {
  readyState: number
  addEventListener: (
    type: 'open' | 'close' | 'message',
    listener: RuntimeOrpcSocketEventListener,
    options?: boolean | { once?: boolean }
  ) => void
  removeEventListener: (
    type: 'open' | 'close' | 'message',
    listener: RuntimeOrpcSocketEventListener
  ) => void
  send: (data: string | ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>) => void
}

export type RuntimeOrpcFacade = {
  createClient: (link: RuntimeOrpcLink) => RuntimeOrpcClient
  createSocketLink: (
    socket: RuntimeOrpcSocketLike,
    headers: Record<string, string>
  ) => RuntimeOrpcLink
}
