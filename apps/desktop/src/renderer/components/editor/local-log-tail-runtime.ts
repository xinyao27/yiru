import type {
  FileLogTailReadInput,
  RuntimeLogTailReadResult,
  RuntimeLogTailWatchEvent
} from '@yiru/runtime-protocol/contract'
import {
  callRuntimeOrpc,
  createRuntimeOrpcClient,
  type RuntimeClientTarget
} from '~renderer/runtime/orpc-client'

export type RuntimeLogTailWatch = {
  /** Resolves once the watch is installed, or rejects if setup failed. */
  ready: Promise<void>
  /** Tears down the stream. Safe to call before or after `ready` settles. */
  stop: () => void
}

export async function readRuntimeLogTailRange(
  target: RuntimeClientTarget,
  args: FileLogTailReadInput
): Promise<RuntimeLogTailReadResult> {
  return callRuntimeOrpc(target, (client) => client.files.readLogTail, args, {
    timeoutMs: 15_000
  })
}

/**
 * Opens a dedicated `files.watchLogTail` stream for one live-tail session.
 * Unlike `files.watch` (shared across Explorer/Source Control consumers of the
 * same worktree), each editor tab tails its own file, so this owns one
 * connection per call rather than fanning out through a shared registry.
 */
export function watchRuntimeLogTail(
  target: RuntimeClientTarget,
  filePath: string,
  subscriptionId: string,
  onChanged: (eventType: 'change' | 'rename') => void
): RuntimeLogTailWatch {
  const abort = new AbortController()
  // Why: an object holder (rather than reassigned bare `let`s) so the
  // resolve/reject captured by the async IIFE below keep the declared
  // function type instead of narrowing through control flow.
  const deferred: { resolve: () => void; reject: (error: unknown) => void } = {
    resolve: () => {},
    reject: () => {}
  }
  const ready = new Promise<void>((resolve, reject) => {
    deferred.resolve = resolve
    deferred.reject = reject
  })

  void (async (): Promise<void> => {
    const connection = await createRuntimeOrpcClient(target, { signal: abort.signal })
    try {
      const stream = await connection.client.files.watchLogTail(
        { filePath, subscriptionId },
        { signal: abort.signal }
      )
      for await (const event of stream as AsyncIterable<RuntimeLogTailWatchEvent>) {
        if (event.type === 'ready') {
          deferred.resolve()
        } else if (event.type === 'changed') {
          onChanged(event.eventType)
        } else if (event.type === 'end') {
          break
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        deferred.reject(error)
      }
    } finally {
      connection.close()
    }
  })()

  return {
    ready,
    stop: () => abort.abort()
  }
}
