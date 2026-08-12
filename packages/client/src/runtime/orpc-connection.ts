import type { ContractRouterClient, runtimeContract } from '@yiru/runtime-protocol/contract'

import type { RuntimeOrpcBinaryListener } from './orpc-binary-side-channel'

export type RuntimeOrpcClientContext = {
  onBinary?: RuntimeOrpcBinaryListener
}

export type RuntimeOrpcClient = ContractRouterClient<
  typeof runtimeContract,
  RuntimeOrpcClientContext
>

export type RuntimeOrpcClientConnection = {
  client: RuntimeOrpcClient
  transport: 'loopback' | 'legacy' | 'web-peer'
  close: () => void
}
