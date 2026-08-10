import type {
  OrchestrationResetInput,
  OrchestrationResetResult
} from '@yiru/runtime-protocol/contract'
import type { RpcContext } from '~main/runtime/rpc/core'

export function handleOrchestrationReset(
  params: OrchestrationResetInput,
  { runtime }: RpcContext
): OrchestrationResetResult {
  const db = runtime.getOrchestrationDb()
  if (params.all) {
    db.resetAll()
    return { reset: 'all' }
  }
  if (params.tasks) {
    db.resetTasks()
    return { reset: 'tasks' }
  }
  if (params.messages) {
    db.resetMessages()
    return { reset: 'messages' }
  }
  throw new Error('Invalid reset scope')
}
