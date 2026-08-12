import { useCallback, useMemo, useRef } from 'react'

import type { MobileTerminalSnapshot } from '~/transport/terminal-multiplex/types'

import type { TerminalWebViewCommand } from './messages'

type OutputMetadata = {
  endSeq: string
  wireByteLength: number
  ackEveryBytes: number
}

type TerminalMultiplexBridge = {
  armReady: () => void
  awaitReady: () => Promise<void>
  handleMessage: (message: Record<string, unknown>) => boolean
  restore: (snapshot: MobileTerminalSnapshot, onParsed: (snapshotId: number) => void) => void
  write: (
    data: string,
    metadata: OutputMetadata,
    onParsed: (endSeq: string, receiverQueueBytes: number) => void
  ) => void
}

export function useTerminalMultiplexBridge(
  postMessage: (message: TerminalWebViewCommand) => void
): TerminalMultiplexBridge {
  const outputParsedRef = useRef<((endSeq: string, receiverQueueBytes: number) => void) | null>(
    null
  )
  const snapshotParsedRef = useRef<((snapshotId: number) => void) | null>(null)
  const readyPromiseRef = useRef<Promise<void> | null>(null)
  const readyResolveRef = useRef<(() => void) | null>(null)

  const armReady = useCallback(() => {
    readyResolveRef.current?.()
    readyPromiseRef.current = new Promise<void>((resolve) => {
      readyResolveRef.current = resolve
    })
  }, [])

  const handleMessage = useCallback((message: Record<string, unknown>) => {
    if (message.type === 'ready') {
      const resolve = readyResolveRef.current
      readyResolveRef.current = null
      readyPromiseRef.current = null
      resolve?.()
      return true
    }
    if (message.type === 'output-parsed' && typeof message.endSeq === 'string') {
      outputParsedRef.current?.(
        message.endSeq,
        typeof message.receiverQueueBytes === 'number' ? message.receiverQueueBytes : 0
      )
      return true
    }
    if (message.type === 'snapshot-parsed' && typeof message.snapshotId === 'number') {
      snapshotParsedRef.current?.(message.snapshotId)
      return true
    }
    return false
  }, [])

  const write = useCallback(
    (
      data: string,
      metadata: OutputMetadata,
      onParsed: (endSeq: string, receiverQueueBytes: number) => void
    ) => {
      outputParsedRef.current = onParsed
      postMessage({ type: 'write', data, ...metadata })
    },
    [postMessage]
  )

  const restore = useCallback(
    (snapshot: MobileTerminalSnapshot, onParsed: (snapshotId: number) => void) => {
      snapshotParsedRef.current = onParsed
      armReady()
      postMessage({ type: 'restore', snapshot })
    },
    [armReady, postMessage]
  )

  const awaitReady = useCallback(async () => {
    const ready = readyPromiseRef.current
    if (!ready) {
      return
    }
    await new Promise<void>((resolve) => {
      let settled = false
      const timeout = setTimeout(() => {
        settled = true
        resolve()
      }, 3000)
      void ready.finally(() => {
        if (!settled) {
          clearTimeout(timeout)
          settled = true
          resolve()
        }
      })
    })
  }, [])

  return useMemo(
    () => ({ armReady, awaitReady, handleMessage, restore, write }),
    [armReady, awaitReady, handleMessage, restore, write]
  )
}
