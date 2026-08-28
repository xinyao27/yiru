import type { BrowserTargetInput } from '@yiru/runtime-protocol/contract'

import type { RuntimeOrpcClient } from '../orpc-types'

export type BrowserCliContext = {
  args: string[]
  client: RuntimeOrpcClient
  json: boolean
}

export type BrowserCliHandler = (context: BrowserCliContext) => Promise<void>

export type BrowserCliTarget = BrowserTargetInput
