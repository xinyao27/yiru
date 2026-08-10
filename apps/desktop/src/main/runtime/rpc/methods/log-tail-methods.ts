import { watch } from 'node:fs'

import type {
  FileLogTailReadInput,
  FileLogTailWatchInput,
  RuntimeLogTailWatchEvent
} from '@yiru/runtime-protocol/contract'

import { readLocalLogTailRange } from '../../../ai-vault/local-log-tail-reader'
import { resolveAuthorizedLogTailPath } from '../../../filesystem/local-log-tail'
import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

let logTailSubscriptionSeq = 0

// Why: the path is an absolute host path outside any worktree, so a
// worktree grant cannot bound it; `resolveAuthorizedPath` is still the gate
// that keeps reads inside store-authorized roots.
export async function handleFilesReadLogTail(params: FileLogTailReadInput) {
  const filePath = await resolveAuthorizedLogTailPath(params.filePath)
  return readLocalLogTailRange(filePath, params.fromByteOffset, params.expectedIdentity)
}

export async function handleFilesWatchLogTail(
  params: FileLogTailWatchInput,
  { runtime, connectionId, signal }: RpcContext,
  emit: (event: RuntimeLogTailWatchEvent) => void
): Promise<void> {
  const filePath = await resolveAuthorizedLogTailPath(params.filePath)
  await new Promise<void>((resolve) => {
    let closed = false
    let removeAbortListener = (): void => {}
    const watcher = watch(filePath, (eventType) => {
      if (!closed) {
        emit({ type: 'changed', eventType: eventType === 'rename' ? 'rename' : 'change' })
      }
    })

    const seq = ++logTailSubscriptionSeq
    const subscriptionId = `files-log-tail-${connectionId ?? 'inproc'}-${seq}`
    const close = (): void => {
      if (closed) {
        return
      }
      closed = true
      removeAbortListener()
      watcher.close()
      emit({ type: 'end' })
      resolve()
    }
    // Why: an fs watcher error commonly accompanies rotation. Signal one
    // final drain so the reader can detect the identity change, then
    // release the dead handle — mirroring the IPC implementation.
    watcher.on('error', () => {
      if (!closed) {
        emit({ type: 'changed', eventType: 'rename' })
      }
      runtime.cleanupSubscription(subscriptionId)
    })

    runtime.registerSubscriptionCleanup(subscriptionId, close, connectionId)
    removeAbortListener = bindSubscriptionAbort(runtime, subscriptionId, signal)
    if (closed) {
      return
    }
    emit({ type: 'ready', subscriptionId })
  })
}
