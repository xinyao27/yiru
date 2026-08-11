import { encodeTerminalMultiplexCreditRecord } from '@yiru/runtime-protocol/terminal-multiplex/flow-records'
import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@yiru/runtime-protocol/terminal-multiplex/frame'

import {
  updateViewportForClient,
  type TerminalViewportClient
} from '../rpc/methods/terminal-viewport-control'
import type { YiruRuntimeService } from '../yiru-runtime'
import type { TerminalMultiplexSnapshotCoordinator } from './snapshot-coordinator'
import type { TerminalMultiplexStreamOutput } from './stream-output'
import type { TerminalMultiplexSubscribeRecord } from './stream-records'

type TerminalMultiplexStreamSubscriptionOptions = {
  runtime: YiruRuntimeService
  ptyId: string
  client: TerminalViewportClient
  subscriptionKey: string
  record: TerminalMultiplexSubscribeRecord
  subscribeCorrelationId: number
  output: TerminalMultiplexStreamOutput
  snapshots: TerminalMultiplexSnapshotCoordinator
  allocateSnapshotId: () => number
  registerUnsubscriber: (unsubscribe: () => void) => void
  send: (
    opcode: TerminalMultiplexOpcodeValue,
    seq: bigint,
    correlationId: number,
    payload?: Uint8Array<ArrayBufferLike>
  ) => boolean
  sendJson: (
    opcode: TerminalMultiplexOpcodeValue,
    seq: bigint,
    correlationId: number,
    value: Record<string, unknown>
  ) => void
  finish: (exitCode: number | null) => void
  exitSignal: AbortSignal
}

export async function activateTerminalMultiplexStream(
  options: TerminalMultiplexStreamSubscriptionOptions
): Promise<boolean> {
  const { runtime, ptyId } = options
  const releaseDelivery = runtime.registerTerminalMultiplexDelivery(
    ptyId,
    options.record.transportGeneration,
    (data, meta) => options.output.enqueue(data, meta)
  )
  if (!releaseDelivery) {
    return false
  }
  options.registerUnsubscriber(releaseDelivery)
  options.registerUnsubscriber(runtime.registerRemoteTerminalViewSubscriber(ptyId))
  for (const unsubscribe of createStreamSubscriptions(options)) {
    options.registerUnsubscriber(unsubscribe)
  }
  options.output.gate(!options.record.delivery.visible && !options.record.delivery.interested)
  if (options.record.viewport) {
    await updateViewportForClient(
      runtime,
      ptyId,
      options.subscriptionKey,
      options.client,
      options.record.viewport,
      'desktop',
      'register'
    )
  }
  const size = runtime.getTerminalSize(ptyId) ?? { cols: 80, rows: 24 }
  const snapshotId = options.allocateSnapshotId()
  options.sendJson(
    TerminalMultiplexOpcode.Subscribed,
    runtime.getTerminalWireByteSequence(ptyId),
    options.subscribeCorrelationId,
    {
      terminal: options.record.terminal,
      transportGeneration: options.record.transportGeneration,
      ptyState: 'running',
      ...size,
      displayMode: runtime.getMobileDisplayMode(ptyId),
      driver: runtime.getDriver(ptyId),
      initialState: 'snapshot',
      snapshotId,
      truncated: false
    }
  )
  options.send(
    TerminalMultiplexOpcode.Credit,
    0n,
    0,
    encodeTerminalMultiplexCreditRecord({
      direction: 1,
      reason: 0,
      maxInFlightBytes: 64 * 1024,
      ackEveryBytes: 16 * 1024,
      maxFrameBytes: 64 * 1024
    })
  )
  sendInitialSideEffects(options)
  await options.snapshots.start(options.record.lastParsedSeq === 0n ? 0 : 4, snapshotId)
  void runtime
    .waitForTerminal(options.record.terminal, {
      condition: 'exit',
      signal: options.exitSignal
    })
    .then((result) => options.finish(result.exitCode))
    .catch(() => {})
  return true
}

function createStreamSubscriptions(
  options: TerminalMultiplexStreamSubscriptionOptions
): (() => void)[] {
  const { runtime, ptyId } = options
  return [
    runtime.subscribeToTerminalResize(ptyId, (event) =>
      options.sendJson(
        TerminalMultiplexOpcode.Resized,
        runtime.getTerminalWireByteSequence(ptyId),
        0,
        {
          cols: event.cols,
          rows: event.rows,
          displayMode: event.displayMode,
          reason: event.reason === 'mode-change' ? 'mode-change' : 'provider',
          applied: true
        }
      )
    ),
    runtime.subscribeToFitOverrideChanges(ptyId, (event) =>
      options.sendJson(
        TerminalMultiplexOpcode.FitOverride,
        runtime.getTerminalWireByteSequence(ptyId),
        0,
        event
      )
    ),
    runtime.subscribeToDriverChanges(ptyId, (driver) =>
      options.sendJson(
        TerminalMultiplexOpcode.Driver,
        runtime.getTerminalWireByteSequence(ptyId),
        0,
        { driver }
      )
    ),
    runtime.subscribeToTerminalSideEffects(ptyId, (batch, wireByteSeq) =>
      options.sendJson(TerminalMultiplexOpcode.SideEffectBatch, wireByteSeq, 0, {
        facts: batch.facts,
        replay: batch.replay === true,
        ...(batch.worktreeId ? { worktreeId: batch.worktreeId } : {}),
        ...(batch.tabId ? { tabId: batch.tabId } : {}),
        ...(batch.paneKey ? { paneKey: batch.paneKey } : {}),
        ...(batch.connectionId !== undefined ? { connectionId: batch.connectionId } : {})
      })
    ),
    runtime.subscribeToTerminalMultiplexClear(ptyId, (seq, correlationId, initiatorClientId) =>
      options.sendJson(TerminalMultiplexOpcode.ClearBuffer, seq, correlationId, {
        operation: 'applied',
        initiatorClientId
      })
    ),
    runtime.subscribeToTerminalMultiplexRestore(ptyId, (_seq, reason) =>
      options.snapshots.recover(reason, options.output.deliveryGated)
    )
  ]
}

function sendInitialSideEffects(options: TerminalMultiplexStreamSubscriptionOptions): void {
  const snapshot = options.runtime.getTerminalSideEffectSnapshot(options.ptyId)
  if (!snapshot) {
    return
  }
  options.sendJson(
    TerminalMultiplexOpcode.SideEffectBatch,
    options.runtime.getTerminalWireByteSequence(options.ptyId),
    0,
    {
      facts: snapshot.facts,
      replay: true,
      ...(snapshot.worktreeId ? { worktreeId: snapshot.worktreeId } : {}),
      ...(snapshot.tabId ? { tabId: snapshot.tabId } : {}),
      ...(snapshot.paneKey ? { paneKey: snapshot.paneKey } : {}),
      ...(snapshot.connectionId !== undefined ? { connectionId: snapshot.connectionId } : {})
    }
  )
}
