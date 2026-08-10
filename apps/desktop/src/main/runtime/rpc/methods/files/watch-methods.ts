import type {
  FileUnwatchInput,
  FileWorktreeInput,
  RuntimeFileWatchEvent
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../../core'
import { runFileWatchStream } from '../file-watch-stream-lifecycle'

let filesWatchSubscriptionSeq = 0

export async function handleFilesWatch(
  params: FileWorktreeInput,
  { runtime, fileCommands, connectionId, signal }: RpcContext,
  emit: (event: RuntimeFileWatchEvent) => void
): Promise<void> {
  const seq = ++filesWatchSubscriptionSeq
  const subscriptionId = `files-watch-${connectionId ?? 'inproc'}-${seq}`
  await runFileWatchStream({
    runtime,
    fileCommands,
    worktree: params.worktree,
    connectionId,
    signal,
    subscriptionId,
    emit: emit as (event: unknown) => void
  })
}

export async function handleFilesUnwatch(params: FileUnwatchInput, { runtime }: RpcContext) {
  await runtime.cleanupSubscriptionAndWait(params.subscriptionId)
  return { unsubscribed: true as const }
}
