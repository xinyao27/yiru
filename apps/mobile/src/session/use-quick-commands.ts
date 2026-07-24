import type { TerminalQuickCommand } from '@yiru/workbench-model/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  applyTerminalQuickCommandMutation,
  parseNormalizedTerminalQuickCommands,
  type TerminalQuickCommandMutation
} from '../terminal/quick-commands'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcFailure, RpcSuccess } from '../transport/types'

type QuickCommandsState = {
  commands: TerminalQuickCommand[]
  loading: boolean
  ready: boolean
  error: string | null
  persist: (mutation: TerminalQuickCommandMutation) => Promise<boolean>
}

type PendingMutation = { id: number; mutation: TerminalQuickCommandMutation }

type MutationContext = {
  client: RpcClient
  confirmed: TerminalQuickCommand[]
  pending: PendingMutation[]
  queue: Promise<void>
  nextMutationId: number
}

function readQuickCommands(result: unknown): TerminalQuickCommand[] | null {
  const list = (result as { terminalQuickCommands?: unknown } | null)?.terminalQuickCommands
  return parseNormalizedTerminalQuickCommands(list)
}

export function useQuickCommands({
  client,
  enabled
}: {
  client: RpcClient | null
  enabled: boolean
}): QuickCommandsState {
  const [commands, setCommands] = useState<TerminalQuickCommand[]>([])
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const commandsRef = useRef<TerminalQuickCommand[]>([])
  const operationIdRef = useRef(0)
  const mutationContextRef = useRef<MutationContext | null>(null)

  useEffect(() => {
    if (!enabled || !client) {
      setReady(false)
      return
    }
    let context = mutationContextRef.current
    if (context?.client !== client) {
      context = { client, confirmed: [], pending: [], queue: Promise.resolve(), nextMutationId: 0 }
      mutationContextRef.current = context
      commandsRef.current = []
      setCommands([])
    }
    let stale = false
    const operationId = operationIdRef.current + 1
    operationIdRef.current = operationId
    setLoading(true)
    setReady(false)
    setError(null)

    void (async () => {
      try {
        // Why: reopen reads wait behind saves so an older host snapshot cannot
        // replace the canonical result from an in-flight mutation.
        await context.queue
        if (
          stale ||
          operationId !== operationIdRef.current ||
          mutationContextRef.current !== context
        ) {
          return
        }
        const response = await client.sendRequest('settings.getTerminalQuickCommands')
        if (
          stale ||
          operationId !== operationIdRef.current ||
          mutationContextRef.current !== context
        ) {
          return
        }
        if (!response.ok) {
          setError((response as RpcFailure).error.message || 'Failed to load quick commands')
          return
        }
        const next = readQuickCommands((response as RpcSuccess).result)
        if (!next) {
          setError('Failed to load quick commands')
          return
        }
        context.confirmed = next
        commandsRef.current = next
        setCommands(next)
        setReady(true)
      } catch (loadError) {
        if (
          !stale &&
          operationId === operationIdRef.current &&
          mutationContextRef.current === context
        ) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load quick commands')
        }
      } finally {
        if (
          !stale &&
          operationId === operationIdRef.current &&
          mutationContextRef.current === context
        ) {
          setLoading(false)
        }
      }
    })()
    return () => {
      stale = true
    }
  }, [client, enabled])

  const persist = useCallback(
    async (commandMutation: TerminalQuickCommandMutation) => {
      const context = mutationContextRef.current
      if (!client || loading || !ready || context?.client !== client) {
        return false
      }
      const mutation = { id: context.nextMutationId + 1, mutation: commandMutation }
      context.nextMutationId = mutation.id
      context.pending.push(mutation)
      const optimistic = applyTerminalQuickCommandMutation(commandsRef.current, commandMutation)
      commandsRef.current = optimistic
      setCommands(optimistic)
      setError(null)

      const send = async (): Promise<boolean> => {
        let succeeded = false
        let failureMessage: string | null = null
        try {
          const response = await client.sendRequest('settings.updateTerminalQuickCommands', {
            mutation: commandMutation
          })
          if (!response.ok) {
            throw new Error(
              (response as RpcFailure).error.message || 'Failed to save quick command'
            )
          }
          const confirmed = readQuickCommands((response as RpcSuccess).result)
          if (!confirmed) {
            throw new Error('Failed to save quick command')
          }
          context.confirmed = confirmed
          succeeded = true
          return true
        } catch (saveError) {
          failureMessage =
            saveError instanceof Error ? saveError.message : 'Failed to save quick command'
          return false
        } finally {
          context.pending = context.pending.filter((pending) => pending.id !== mutation.id)
          if (mutationContextRef.current === context) {
            const next = context.pending.reduce(
              (current, pending) => applyTerminalQuickCommandMutation(current, pending.mutation),
              context.confirmed
            )
            commandsRef.current = next
            setCommands(next)
            if (!context.pending.some((pending) => pending.id > mutation.id)) {
              setError(succeeded ? null : failureMessage)
            }
          }
        }
      }
      const request = context.queue.then(send, send)
      context.queue = request.then(
        () => undefined,
        () => undefined
      )
      return await request
    },
    [client, loading, ready]
  )

  return { commands, loading, ready, error, persist }
}
