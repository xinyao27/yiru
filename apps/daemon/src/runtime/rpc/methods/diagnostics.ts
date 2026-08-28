import type { MemorySnapshot } from '@yiru/runtime-protocol/workbench/types'

import type { RpcContext } from '../core'

export async function handleDiagnosticsMemory(
  _params: void,
  { runtime }: RpcContext
): Promise<MemorySnapshot> {
  return await runtime.getMemorySnapshot()
}
