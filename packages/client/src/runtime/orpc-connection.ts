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
  transport: 'extension' | 'runtime-environment'
  close: () => void
}
