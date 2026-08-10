import type { MemorySnapshot } from '~shared/types'

import type { RpcContext } from '../core'

export async function handleDiagnosticsMemory(
  _params: void,
  { runtime }: RpcContext
): Promise<MemorySnapshot> {
  return await runtime.getMemorySnapshot()
}
