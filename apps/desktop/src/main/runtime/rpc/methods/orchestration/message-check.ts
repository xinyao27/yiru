import { ORCHESTRATION_LEGACY_RUN_ID } from '../../../../../shared/orchestration-rpc-contract'
import type { MessageType } from '../../../orchestration/db'
import { formatMessageBanner } from '../../../orchestration/formatter'
import { reconcileLifecycleMessage } from '../../../orchestration/lifecycle-reconciliation'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import { defineMethod, type RpcMethod } from '../../core'
import { MessageReadParams, parseMessageTypes } from './message-read-request'
import { resolveRunScope } from './run-scope'

export const ORCHESTRATION_MESSAGE_CHECK_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'orchestration.check',
    params: MessageReadParams,
    handler: async (params, { runtime, signal }) => {
      const db = runtime.getOrchestrationDb()
      const handle = params.terminal ?? 'unknown'
      const typeFilter = parseMessageTypes(params.types)

      // Why: a live runtime handle is authoritative; pane metadata is only the restart fallback.
      const paneKey = runtime.getTerminalPaneKey(handle) ?? params.terminalPaneKey
      const boundRun = paneKey ? db.getCurrentRunForPane(paneKey) : undefined
      if (params.run || boundRun) {
        const run = resolveRunScope(runtime, {
          runId: params.run,
          callerTerminalHandle: handle,
          callerPaneKey: paneKey ?? undefined,
          requireCurrentConsumer: true
        })
        const generation = run.consumer_generation
        const address = `run:${run.id}`
        runtime.ensureOrchestrationFederationRelay(run.id)

        const acknowledged = params.ack
          ? db.acknowledgeRunDelivery({
              runId: run.id,
              consumerGeneration: generation,
              deliveryId: params.ack
            })
          : undefined
        if (params.peek || params.all || params.unread === false) {
          const history = db.getRunMailboxHistory(run.id, 100, typeFilter)
          const messages =
            params.all || (params.unread === false && !params.peek)
              ? history
              : history.filter((message) => message.read === 0)
          const result = {
            messages,
            count: messages.length,
            acknowledged: acknowledged?.delivery.id ?? null
          }
          if (params.format || params.inject) {
            return {
              ...result,
              formatted: messages.map(formatMessageBanner).join('\n\n'),
              runId: run.id
            }
          }
          return { ...result, runId: run.id }
        }

        const readDelivery = (wakeTypes?: MessageType[]) =>
          db.getOrCreateRunDelivery({
            runId: run.id,
            consumerGeneration: generation,
            wakeTypes
          })
        let current = readDelivery(params.wait ? typeFilter : undefined)
        if (current) {
          return {
            runId: run.id,
            deliveryId: current.delivery.id,
            messages: current.messages,
            count: current.messages.length,
            replayed: current.replayed,
            acknowledged: acknowledged?.delivery.id ?? null,
            timedOut: false,
            cancelled: false,
            connectionLost: false,
            ...(params.format || params.inject
              ? { formatted: current.messages.map(formatMessageBanner).join('\n\n') }
              : {})
          }
        }
        if (!params.wait) {
          return {
            runId: run.id,
            deliveryId: null,
            messages: [],
            count: 0,
            acknowledged: acknowledged?.delivery.id ?? null,
            timedOut: false,
            cancelled: false,
            connectionLost: false
          }
        }

        const waitResult = await runtime.waitForMessage(address, {
          typeFilter: typeFilter as string[] | undefined,
          timeoutMs: params.timeoutMs ?? undefined,
          signal,
          exclusive: true
        })
        const latestRun = db.getRun(run.id)
        if (!latestRun || latestRun.consumer_generation !== generation) {
          throw new OrchestrationError(
            'consumer_fenced',
            'This mailbox consumer was replaced while waiting.'
          )
        }
        if (waitResult === 'waiter_exists') {
          throw new OrchestrationError(
            'waiter_exists',
            `Run ${run.id} already has an active actionable waiter.`
          )
        }
        if (waitResult === 'timed_out') {
          return {
            runId: run.id,
            deliveryId: null,
            messages: [],
            count: 0,
            acknowledged: acknowledged?.delivery.id ?? null,
            timedOut: true,
            cancelled: false,
            connectionLost: false
          }
        }
        if (waitResult === 'cancelled') {
          return {
            runId: run.id,
            deliveryId: null,
            messages: [],
            count: 0,
            acknowledged: acknowledged?.delivery.id ?? null,
            timedOut: false,
            cancelled: true,
            connectionLost: signal?.aborted === true
          }
        }

        current = readDelivery(typeFilter)
        return {
          runId: run.id,
          deliveryId: current?.delivery.id ?? null,
          messages: current?.messages ?? [],
          count: current?.messages.length ?? 0,
          replayed: current?.replayed ?? false,
          acknowledged: acknowledged?.delivery.id ?? null,
          timedOut: false,
          cancelled: false,
          connectionLost: false,
          ...(params.format && current
            ? { formatted: current.messages.map(formatMessageBanner).join('\n\n') }
            : {})
        }
      }

      const activeDispatch = db.getActiveDispatchForIdentity(handle, paneKey ?? undefined)
      const remoteAttachment =
        !activeDispatch && paneKey ? db.findActiveRemoteAttachmentForPane(paneKey) : undefined
      if (
        remoteAttachment &&
        !db.isRemoteAttachmentProcessCurrent({
          dispatchId: remoteAttachment.dispatch_id,
          paneKey: paneKey ?? null,
          processIncarnation: runtime.getTerminalProcessIncarnation(handle)
        })
      ) {
        throw new OrchestrationError(
          'dispatch_inactive',
          `Dispatch ${remoteAttachment.dispatch_id} is no longer attached to this worker process.`
        )
      }
      const workerMailbox = activeDispatch
        ? { dispatchId: activeDispatch.id, runId: activeDispatch.run_id }
        : remoteAttachment
          ? { dispatchId: remoteAttachment.dispatch_id, runId: undefined }
          : undefined
      if (workerMailbox) {
        const address = `dispatch:${workerMailbox.dispatchId}`
        const showAll = params.all === true || (params.unread === false && params.peek !== true)
        const messages = showAll
          ? db.getAllMessagesForHandle(address, 100, typeFilter)
          : db.getUnreadMessages(address, typeFilter)
        if (!showAll && params.peek !== true && messages.length > 0) {
          db.markAsRead(messages.map((message) => message.id))
        }
        if (messages.length > 0 || !params.wait) {
          return {
            ...(workerMailbox.runId ? { runId: workerMailbox.runId } : {}),
            dispatchId: workerMailbox.dispatchId,
            messages,
            count: messages.length,
            ...(params.format || params.inject
              ? { formatted: messages.map(formatMessageBanner).join('\n\n') }
              : {})
          }
        }
        const waitResult = await runtime.waitForMessage(address, {
          typeFilter: typeFilter as string[] | undefined,
          timeoutMs: params.timeoutMs ?? undefined,
          signal
        })
        if (waitResult === 'timed_out' || waitResult === 'cancelled') {
          return {
            ...(workerMailbox.runId ? { runId: workerMailbox.runId } : {}),
            dispatchId: workerMailbox.dispatchId,
            messages: [],
            count: 0,
            timedOut: waitResult === 'timed_out',
            cancelled: waitResult === 'cancelled',
            connectionLost: waitResult === 'cancelled' && signal?.aborted === true
          }
        }
        const arrived = db.getUnreadMessages(address, typeFilter)
        db.markAsRead(arrived.map((message) => message.id))
        return {
          ...(workerMailbox.runId ? { runId: workerMailbox.runId } : {}),
          dispatchId: workerMailbox.dispatchId,
          messages: arrived,
          count: arrived.length,
          ...(params.format || params.inject
            ? { formatted: arrived.map(formatMessageBanner).join('\n\n') }
            : {})
        }
      }

      // Why: unread:false is honored for one release as a compat shim so in-flight callers don't break (design doc §5).
      const showAll = params.all === true || (params.unread === false && params.peek !== true)
      const consumeUnread = !showAll && params.peek !== true

      const readAndReturn = () => {
        const messages = showAll
          ? db.getAllMessagesForHandle(handle, undefined, typeFilter)
          : db.getUnreadMessages(handle, typeFilter)

        if (
          consumeUnread &&
          messages.some((message) => message.run_id === ORCHESTRATION_LEGACY_RUN_ID)
        ) {
          throw new OrchestrationError(
            'legacy_read_only',
            'Legacy orchestration messages are inspect-only; use --peek or --all. No acknowledgment was applied.',
            { effectsApplied: false }
          )
        }

        let visibleMessages = messages
        if (consumeUnread && messages.length > 0) {
          // Why: unread check is an authoritative read path for worker_done/heartbeat, so reconcile lifecycle messages here too.
          visibleMessages = messages.map((message) => {
            const reconciled = reconcileLifecycleMessage(db, message)
            return reconciled.action === 'rejected'
              ? (db.getMessageById(message.id) ?? message)
              : message
          })
          db.markAsRead(messages.map((m) => m.id))
        }

        if (params.format || params.inject) {
          const formatted = visibleMessages.map(formatMessageBanner).join('\n\n')
          return { messages: visibleMessages, formatted, count: visibleMessages.length }
        }

        return { messages: visibleMessages, count: visibleMessages.length }
      }

      if (signal?.aborted) {
        return { messages: [], count: 0 }
      }
      const result = readAndReturn()
      if (result.count > 0 || !params.wait) {
        return result
      }

      // Why: signal aborts this waiter when the client socket closes, freeing the long-poll slot immediately rather than after timeoutMs (design doc §3.1).
      await runtime.waitForMessage(handle, {
        typeFilter: typeFilter as string[] | undefined,
        timeoutMs: params.timeoutMs ?? undefined,
        signal
      })
      if (signal?.aborted) {
        return { messages: [], count: 0 }
      }
      return readAndReturn()
    }
  })
]
